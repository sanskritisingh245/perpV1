import { orderbooks, users } from ".."
export function findMatchingOrders(userId:string ,symbol:string , side:string , quantity:number , price: number, leverage :number) {
    let requiredAsset=orderbooks[symbol];
    const buyerId=userId;
    if(side === "long"){
        let asks= requiredAsset?.asks;
        if(!asks){return}
        const bestAsks = Object.keys(asks).map(Number).sort((a,b)=>a-b);
        let remaining= quantity;
        for (let ask of  bestAsks){
            if(ask>price){
              break;
            }
            const level=asks[ask.toString()]; //availableQty , openorders
            if(!level){
                continue;
            }
            //looping through openorders 
            for(const order of level.openOrders){
                const sellerId=order.userId;
                const fillable=order.qty - order.filledQty; // finding the qty still left to be filled 
                if(fillable === 0) continue;
                const take= Math.min(remaining, fillable); // whatever finding the min , so that we can subtract that from qty
                order.filledQty +=take;
                level.availableQty -= take; // reducing the quantity
                remaining -=take; // fidning how much is still remainin
                if(remaining === 0) break;     
            }
            const filledQty = quantity - remaining;   // how much actually got filled
            const fillPrice = ask; 
            let liquidationPrice = 0;
            const user=users.find((user=> user.userId === buyerId))
            const positions = user?.positions.find(p=> p.market === symbol && p.type === side.toUpperCase());
            if(positions){
                const newTotalQty= positions.qty +filledQty
                positions.averagePrice *positions.qty + fillPrice *filledQty;
                positions.qty=newTotalQty;
                let liquidateAt =(positions.averagePrice * leverage)/100
                positions.liquidationPrice  -= liquidateAt;
                liquidationPrice=positions.liquidationPrice;
            }else{
                user?.positions.push({
                    market:symbol,
                    type:side.toUpperCase(),
                    qty:filledQty,
                    margin:0,
                    averagePrice:fillPrice,
                    liquidationPrice:liquidationPrice,
                    pnL:0
                })
 
            }
            level.openOrders = level.openOrders.filter(o =>o.filledQty <o.qty)
            if(level.openOrders.length ===0 ) {
                delete asks[ask.toString()]
            }
            if(remaining === 0) break;
                
            //orderbook 
            //postionupdate -> $100 ->1 , $110->1 , $120->2  450/4=112.5 => averageprice 
            // liquidationprice => (112.5 *10)/100 = 11.25  liquidationprice= 112.5-11.25 (long) 112.5+11.25(short) 
        }
    }else{
        let bids= requiredAsset?.bids;
        if(!bids){return}
        const bestBids = Object.keys(bids).map(Number).sort((a,b)=>a-b);
        let remaining= quantity;
        for (let bid of  bestBids){
            if(bid>price){
              break;
            }
            const level=bids[bid.toString()]; //availableQty , openorders
            if(!level){
                continue;
            }
            //looping through openorders 
            for(const order of level.openOrders){
                const sellerId=order.userId;
                const fillable=order.qty - order.filledQty; // finding the qty still left to be filled 
                if(fillable === 0) continue;
                const take= Math.min(remaining, fillable); // whatever finding the min , so that we can subtract that from qty
                order.filledQty +=take;
                level.availableQty -= take; // reducing the quantity
                remaining -=take; // fidning how much is still remainin
                if(remaining === 0) break;     
            }
            const filledQty = quantity - remaining;   // how much actually got filled
            const fillPrice = bid; 
            let liquidationPrice = 0;
            const user=users.find((user=> user.userId === buyerId))
            const positions = user?.positions.find(p=> p.market === symbol && p.type === side.toUpperCase());
            if(positions){
                const newTotalQty= positions.qty +filledQty
                positions.averagePrice=(positions.averagePrice *positions.qty + fillPrice *filledQty);
                positions.qty=newTotalQty;
                let liquidateAt =(positions.averagePrice * leverage)/100
                positions.liquidationPrice  += liquidateAt;
                liquidationPrice=positions.liquidationPrice;
            }else{
                user?.positions.push({
                    market:symbol,
                    type:side.toUpperCase(),
                    qty:filledQty,
                    margin:0,
                    averagePrice:fillPrice,
                    liquidationPrice:liquidationPrice,
                    pnL:0
                })
 
            }
            level.openOrders = level.openOrders.filter(o =>o.filledQty <o.qty)
            if(level.openOrders.length ===0 ) {
                delete bids[bid.toString()]
            }
            if(remaining === 0) break;
                
            //orderbook 
            //postionupdate -> $100 ->1 , $110->1 , $120->2  450/4=112.5 => averageprice 
            // liquidationprice => (112.5 *10)/100 = 11.25  liquidationprice= 112.5-11.25 (long) 112.5+11.25(short) 
        }

    }

}


// export function excuteTrade(symbol:string , side:string , quantity:number , price: number, match:string){

// }


// 