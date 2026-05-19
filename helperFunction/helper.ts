import { orderbooks, users } from ".."

type Level = {
    availableQty: number;
    openOrders: { userId: string; qty: number; filledQty: number; orderId: number; createdAt: Date }[];
}//type bid of index

type Fill = {
    makerUserId: string;
    makerOrderId: number;
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
    indexPrice: number,
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
        return { fills: [], filledQty: 0, remainingQty: quantity, averageFillPrice: 0, status: "none" as const };
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
            p => p.market === symbol && p.type === side.toUpperCase()
        );

        if (position) {
            const newTotalQty = position.qty + filledQty; //avergae calculated 
            position.averagePrice =
                (position.averagePrice * position.qty + fillPrice * filledQty) / newTotalQty;
            position.qty = newTotalQty;

            const liquidateAt = (position.averagePrice / leverage) ;
            position.liquidationPrice = isLong                            
                ? position.averagePrice - liquidateAt
                : position.averagePrice + liquidateAt;
            position.pnL = isLong        // unrealized pnl                                 
                ? (indexPrice - position.averagePrice) * position.qty
                : (position.averagePrice - indexPrice) * position.qty;
        } else {
            const liquidateAt = (fillPrice / leverage) ; // adding back the same fills
            const liquidationPrice = isLong
                ? fillPrice - liquidateAt
                : fillPrice + liquidateAt;
            const pnL = isLong
                ? (indexPrice - fillPrice) * filledQty
                : (fillPrice - indexPrice) * filledQty;

            user?.positions.push({
                market: symbol,
                type: side.toUpperCase(),
                qty: filledQty,
                margin: 0,
                averagePrice: fillPrice,
                liquidationPrice,
                pnL,
            });
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
        status:totalFilled === 0 ? "none" : totalFilled < quantity? "partial" :"filled",
    };        
};


export function findMatchingOrders(
    userId: string,
    symbol: string,
    side: "long" | "short",
    quantity: number,
    price: number,
    leverage: number,
) {
    const requiredAsset = orderbooks[symbol];
    if(!requiredAsset) return ;
    const indexPrice = requiredAsset.indexPrice;
    if (indexPrice == null) return;
    const levels = side === "long" ? requiredAsset.asks : requiredAsset.bids;   
    return matchSide(levels, side, userId, symbol, quantity, price, leverage, indexPrice); //actual matching happening 
}


// export function excuteTrade(symbol:string , side:string , quantity:number , price: number, match:string){

// }


//
