import { orderbooks, users, type Position, type User } from "..";

export function unrealizedPnl(position: Position, markPrice:number):number{
    return position.type === "LONG"
        ? (markPrice - position.averagePrice)*position.qty
        :(position.averagePrice - markPrice)*position.qty;

}

export function checkLiquidations(symbol : string){
    for(const user of users){
        if(!user.positions.some(p => p.market === symbol)) continue;//if user doesn't have any position in this market , move on to the next user

        let equity = user.collateral.available + user.collateral.locked;
        let maintenanceMargin=0;
        for(const position of user.positions){
            const book =orderbooks[symbol];
            if(!book) return;
            const markPrice=book.indexPrice;

            equity +=unrealizedPnl(position, markPrice);//equity= collateral + unrelaizedPnl
            maintenanceMargin +=markPrice *position.qty*book.mmr;
        }
        
        if(equity >= maintenanceMargin) continue; 
        liquidateUser(user);
               
    } 
}

function liquidateUser(user:User){
    for (const position of [...user.positions]){
        const book = orderbooks[position.market];
        if(!book) return;
        const markPrice = book.indexPrice;

        const realizedPnl = unrealizedPnl(position, markPrice); // the unrealized pnl becomes the realized pnl
        user.collateral.locked -=position.margin;
        user.collateral.available += position.margin +realizedPnl;
        user.collateral.available += user.collateral.locked;
    }
    user.positions =[] // replaces the user Array 
}