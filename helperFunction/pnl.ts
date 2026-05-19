import { orderbooks } from "..";

export function unrealizedPnL(position: { type: string; averagePrice: number; qty: number; market: string }) {
    const indexPrice = orderbooks[position.market]?.indexPrice;
    if (indexPrice == null) return 0;
    return position.type === "LONG"
        ? (indexPrice - position.averagePrice) * position.qty
        : (position.averagePrice - indexPrice) * position.qty;
}
