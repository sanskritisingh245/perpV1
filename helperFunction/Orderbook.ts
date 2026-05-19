import { orderbooks } from "..";

export function addToOrderBook(userId :string , symbol:string , side: string , price:number,  remainingQty: number, orderId:string){
    const requiredAsset=orderbooks[symbol];
    if(!requiredAsset) return;
    const levels= side === "long" ? requiredAsset?.bids : requiredAsset?.asks;
    const key=price.toString();
    const level = levels[key]
    if(level){
        level.availableQty +=remainingQty;
        level.openOrders.push({
            userId,
            qty:remainingQty,
            filledQty:0,
            orderId:orderId,
            createdAt:new Date(),
        })
    } else {
        levels[key] ={
            availableQty:remainingQty,
            openOrders:[{
                userId,
                qty:remainingQty,
                filledQty:0,
                orderId:orderId,
                createdAt: new Date(),
            }],
        };
    }

}