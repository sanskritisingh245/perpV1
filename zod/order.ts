import z from "zod";
export const OrderSchema=z.object({
    symbol:z.string(),
    side:z.enum(["long" , "short"]),
    type:z.enum(["limit", "market"]),
    quantity:z.number(),
    price:z.number(),
    leverage:z.number()
})
