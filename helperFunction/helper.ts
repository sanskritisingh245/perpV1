import { orderbooks, users } from ".."

type Level = {
    availableQty: number;
    openOrders: { userId: string; qty: number; filledQty: number; orderId: string; createdAt: Date }[];
}//type bid of index

type Fill = {
    makerUserId: string;
    makerOrderId: string;
    qty: number;
    price: number;
};

function matchSide(
    levels: Record<string, Level>,
    side: "long" | "short",
    userId: string,
    symbol: string,
    quantity: number,
    price: number,
    leverage: number,
) {
    const isLong = side === "long";

    const sortedPrices = Object.keys(levels)
        .map(Number)
        .sort((a, b) => isLong ? a - b : b - a);   // sort according to the long ans short (long -> ascending short -> descending )

    let remaining = quantity; // qty still needeed to be filled 
    const fills: Fill[]=[];
    let totalFilled=0; //qty moved 
    let notional=0; //total value of the trade or the money moved
    const user = users.find(u => u.userId === userId); //finding the taker
    if (!user) {
        return { fills: [], filledQty: 0, remainingQty: quantity, averageFillPrice: 0, status: "OPEN" as const };
    }//because in the function finding match order we are returning matchside 


    for (const levelPrice of sortedPrices) { //iterate over the best price level
        if (isLong ? levelPrice > price : levelPrice < price) break;   // limit of the take check 

        const level = levels[levelPrice.toString()];
        if (!level) continue;

        const remainingBefore = remaining; //to check how much was filled at this level
        for (const order of level.openOrders) { //actual filling 
            const fillable = order.qty - order.filledQty;
            if (fillable === 0) continue; // skip already filled 
            if(order.userId === userId) continue; // user order skipped 
            const take = Math.min(remaining, fillable);
            order.filledQty += take;
            level.availableQty = Math.max(0, level.availableQty - take);
            remaining -= take;
            fills.push({
                makerUserId:order.userId,
                makerOrderId:order.orderId,
                qty:take,
                price:levelPrice
            });
            totalFilled +=take;
            notional += take*levelPrice;
            if (remaining === 0) break; //taker order filled then break
        }

        const filledQty = remainingBefore - remaining; //how much was filled 
        if (filledQty === 0) continue;
        const fillPrice = levelPrice;

        const position = user?.positions.find(
            p => p.market === symbol 
        );

        if(!position){ //no existing position
            const liquidateAt = (fillPrice / leverage) ;
            const liquidationPrice = isLong
                ? fillPrice - liquidateAt
                : fillPrice + liquidateAt;

            user?.positions.push({
                market: symbol,
                type: side.toUpperCase(),
                qty: filledQty,
                margin: (fillPrice * filledQty) / leverage,
                averagePrice: fillPrice,
                liquidationPrice,
            });
        } else if (position.type === side.toUpperCase()) { //same side
            const newTotalQty = position.qty + filledQty; //avergae calculated 
            position.averagePrice =
                (position.averagePrice * position.qty + fillPrice * filledQty) / newTotalQty;
            position.qty = newTotalQty;

            const liquidateAt = (position.averagePrice / leverage) ;
            position.liquidationPrice = isLong
                ? position.averagePrice - liquidateAt
                : position.averagePrice + liquidateAt;
        }else{
            if(filledQty < position.qty){
                const realizedPnl = position.type === "LONG"
                    ?(fillPrice - position.averagePrice)*filledQty
                    :(position.averagePrice - fillPrice)*filledQty;
                const marginReleased=position.margin *(filledQty/position.qty); //give back collateral they locked  position's collateral to give to user proportional to how much of the position is being closed
                user.collateral.locked-=marginReleased;
                user.collateral.available+=marginReleased + realizedPnl;
                position.margin -=marginReleased;
                position.qty -=filledQty;
            }else if(filledQty === position.qty){
                const realizedPnl = position.type === "LONG"
                    ?(fillPrice - position.averagePrice)*position.qty
                    :(position.averagePrice - fillPrice)*position.qty;
                user.collateral.locked -= position.margin;
                user.collateral.available +=position.margin +realizedPnl;
                user.positions = user.positions.filter(p => p !== position);
            }else{
                const oldQty=position.qty;
                const oldAvg=position.averagePrice;
                const oldType=position.type;
                const oldMargin = position.margin;

                const realizedPnl = oldType === "LONG"
                    ?(fillPrice - oldAvg)*oldQty
                    :(oldAvg - fillPrice)*oldQty
                user.collateral.locked -=oldMargin;
                user.collateral.available += oldMargin + realizedPnl;

                user.positions= user.positions.filter(p => p !== position);
                const newQty=filledQty-oldQty;
                const liquidateAt = (fillPrice / leverage) ;
                const liquidationPrice = isLong
                    ? fillPrice - liquidateAt
                    : fillPrice + liquidateAt;

                user?.positions.push({
                    market: symbol,
                    type: side.toUpperCase(),
                    qty: newQty,
                    margin: (fillPrice * newQty) / leverage,
                    averagePrice: fillPrice,
                    liquidationPrice,
                })
            }
        }
        level.openOrders = level.openOrders.filter(o => o.filledQty < o.qty);
        if (level.openOrders.length === 0) { //check if fully filld then remove them also remove them from order book
            delete levels[levelPrice.toString()];
        }
        if (remaining === 0) break; //if taker fully filled then break out of the loop
    }
    return {
        fills,
        filledQty:totalFilled,
        remainingQty:quantity-totalFilled,
        averageFillPrice:totalFilled ===0 ? 0 : notional/totalFilled,
        status:totalFilled === 0 ? "OPEN" : totalFilled < quantity? "PARTIAL" :"FILLED",
    };        
};


export function matchAndExecute(
    userId: string,
    symbol: string,
    side: "long" | "short",
    quantity: number,
    price: number,
    leverage: number,
) {
    const requiredAsset = orderbooks[symbol];
    if(!requiredAsset) return ;
    const levels = side === "long" ? requiredAsset.asks : requiredAsset.bids;
    return matchSide(levels, side, userId, symbol, quantity, price, leverage); //actual matching happening
}


// export function excuteTrade(symbol:string , side:string , quantity:number , price: number, match:string){

// }



