import express, { type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { SignupSchema } from "./zod/auth";
import { authMiddleware } from "./middleware";
import { OrderSchema } from "./zod/order";
import { matchAndExecute } from "./helperFunction/helper";
import { addToOrderBook } from "./helperFunction/Orderbook";
import { checkLiquidations } from "./helperFunction/liquidation";

const JWT_SECRET = process.env.JWT_SECRET || "";

const app = express();
app.use(express.json());

export const users = [
  {
    userId: "1",
    username: "harkirat",
    password: "123123",
    collateral: {
      available: 2000,
      locked: 1000,
    },
    positions: [
      {
        market: "SOL",
        type: "LONG",
        qty: 10,
        margin: 500,
        liquidationPrice: 80,
        averagePrice: 90,
      },
      {
        market: "ETH",
        type: "SHORT",
        qty: 1,
        margin: 500,
        liquidationPrice: 2000,
        averagePrice: 1900,
      },
    ],
    orders: [
      {
        orderId: "1",
        market: "SOL",
        type: "LONG",
        qty: 10,
        margin: 500,
        orderType: "limit",
        price: 90,
        status: "filled",
      },
      {
        orderId: "2",
        market: "ETH",
        type: "SHORT",
        qty: 10,
        margin: 500,
        orderType: "limit",
        price: 1900,
        status: "filled",
      },
      {
        orderId: "3",
        market: "BTC",
        type: "LONG",
        qty: 10,
        margin: 500,
        orderType: "limit",
        price: 1900,
        status: "cancelled",
      },
    ],
  },
  {
    userId: "2",
    username: "raman",
    password: "123123",
    collateral: {
      available: 2000,
      locked: 2000,
    },
    positions: [
      {
        market: "SOL",
        type: "SHORT",
        qty: 10,
        margin: 1000,
        liquidationPrice: 80,
        averagePrice: 90,
      },
      {
        market: "ETH",
        type: "LONG",
        qty: 1,
        margin: 1000,
        liquidationPrice: 2000,
        averagePrice: 1900,
      },
    ],
    orders: [
      {
        orderId: "10",
        market: "SOL",
        type: "SHORT",
        qty: 10,
        margin: 500,
        orderType: "market",
        price: 90,
        status: "filled",
      },
      {
        orderId: "11",
        market: "ETH",
        type: "LONG",
        qty: 10,
        margin: 500,
        orderType: "market",
        price: 1900,
        status: "filled",
      },
      {
        orderId: "12",
        market: "ZEC",
        type: "LONG",
        qty: 10,
        margin: 500,
        orderType: "limit",
        price: 1900,
        status: "open",
      },
    ],
  },
];

export type User = {
  userId:string;
  username:string;
  password:string;
  collateral:{available:number ; locked:number};
  positions:Position[];
  orders:{
    orderId:string;
    market:string;
    type:string;
    qty:number;
    margin:number;
    orderType:string;
    price:number;
    status:string;
  }[];
};

export type Position = {
  market:string,
  type:string,
  qty:number,
  margin:number,
  averagePrice:number,
  liquidationPrice:number;
}
export type Order = {
  orderId: string;
  market: string;
  side: string;
  qty: number;
  filledQty: number;
  remainingQty: number;
  status: string;
};
export const Orders: Order[] = [];
type Bid = {
  availableQty: number;
  openOrders: {
    userId: string;
    qty: number;
    filledQty: number;
    orderId: string;
    createdAt: Date;
    leverage: number;
  }[];
};

type Orderbook = {
  bids: Record<string, Bid>;
  asks: Record<string, Bid>;
  lastTradedPrice: number;
  indexPrice: number;
  mmr:number;
};

type Orderbooks = Record<string, Orderbook>;

export const orderbooks: Orderbooks = {
  SOL: { bids: {}, asks: {}, lastTradedPrice: 90, indexPrice: 90.01, mmr:0.005 },
  ETH: { bids: {}, asks: {}, lastTradedPrice: 1900, indexPrice: 1899.9, mmr:0.005 },
};

export const fills = [
  {
    maker: 1,
    taker: 2,
    market: "SOL",
    qty: 10,
    price: 90,
    long: 1,
    short: 2,
  },
  {
    maker: 1,
    taker: 2,
    market: "ETH",
    qty: 1,
    price: 1900,
    long: 2,
    short: 1,
  },
];

app.post("/signup", (req: Request, res: Response) => {
  try {
    const { success, data } = SignupSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).json({
        success: false,
        error: "INVALID_DATA",
      });
    }
    const userId = crypto.randomUUID();
    users.push({
      userId: userId,
      username: data.username,
      password: data.password,
      collateral: {
        available: 0,
        locked: 0,
      },
      positions: [],
      orders: [],
    });

    return res.status(201).json({
      success: true,
      userId,
    });
  } catch (e: any) {
    return res.status(500).json({
      success: false,
      msg: e.message || "Internal Server Error",
    });
  }
});

app.post("/signin", (req: Request, res: Response) => {
  try {
    const userId = req.body.userId;
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "PLEASE_PROVIDE_USERID",
      });
    }

    const found = users.find((user) => user.userId === userId);
    if (!found) {
      return res.status(400).json({
        success: false,
        error: "USER_NOT_FOUND",
      });
    }
    const token = jwt.sign(
      {
        id: found.userId,
        username: found.username,
      },
      JWT_SECRET,
    );

    return res.status(201).json({
      success: true,
      data: token,
      msg: "SUCCESSFULLY_SIGNEDIN",
    });
  } catch (e: any) {
    return res.status(500).json({
      success: false,
      msg: e.message || "Internal Server Error",
    });
  }
});

app.post("/onramp", authMiddleware, (req: Request, res: Response) => {
  try {
    const userId = req.id;
    const balance = req.body.Balance;
    if (!balance) {
      return res.status(400).json({
        success: false,
        error: "PLEASE_PROVIDE_BALANCE",
      });
    }

    const user = users.find((user) => user.userId === userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "USER_NOT_FOUND",
      });
    }

    let total = user.collateral.available + balance;
    user.collateral.available = total;

    //console.log("yhgsjckl", user)
    return res.status(200).json({
      success: true,
      msg: "BALANCE_UPDATED",
    });
  } catch (e: any) {
    return res.status(500).json({
      success: false,
      msg: e.message || "Internal Server Error",
    });
  }
});

app.post("/order", authMiddleware, (req: Request, res: Response) => {
  try {
    const userId = req.id;
    const { success, data } = OrderSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).json({
        success: false,
        error: "INVALID_DATA",
      });
    }

    const found = users.find((user) => user.userId === userId);
    if (!found) {
      return res.status(400).json({
        success: false,
        error: "USER_NOT_FOUND",
      });
    }
    const balance = found.collateral.available;

    const positionSize = data.price * data.quantity;
    const requiredMargin = positionSize / data.leverage;

    if (balance < requiredMargin) {
      return res.status(400).json({
        success: false,
        error: "NOT_ENOUGH_BALANCE",
      });
    }
    found.collateral.available -= requiredMargin;
    found.collateral.locked += requiredMargin;

    const orderId = crypto.randomUUID();

    const newOrder: Order = {
      orderId,
      market: data.symbol,
      side: data.side,
      qty: data.quantity,
      filledQty: 0,
      remainingQty: data.quantity,
      status: "OPEN",
    };
    Orders.push(newOrder); // how to add the completely filled order in this ???

    const oppositeType = data.side === "long" ? "SHORT" : "LONG";
    const oppositeQtyBefore =
      found.positions.find(p => p.market === data.symbol && p.type === oppositeType)?.qty ?? 0;

    const result = matchAndExecute(
      userId,
      data.symbol,
      data.side,
      data.quantity,
      data.price,
      data.leverage,
    );

    // Refund margin for any qty that netted against an opposite position
    // rather than opening new exposure — that margin was double-locked.
    const oppositeQtyAfter =
      found.positions.find(p => p.market === data.symbol && p.type === oppositeType)?.qty ?? 0;
    const nettedQty = oppositeQtyBefore - oppositeQtyAfter;
    if (nettedQty > 0) {
      const refund = (data.price * nettedQty) / data.leverage;
      found.collateral.locked -= refund;
      found.collateral.available += refund;
    }

    if (result && result.remainingQty > 0) {
        newOrder.filledQty=result.filledQty;
        newOrder.remainingQty=result.remainingQty;
        newOrder.status= result.status.toUpperCase();
      addToOrderBook(
        userId,
        data.symbol,
        data.side,
        data.price,
        result.remainingQty,
        orderId,
        data.leverage,
      );

      checkLiquidations(data.symbol)

      res.status(200).json({
        success:true,
        order:{
          orderId,
          market:data.symbol,
          side:data.side,
          qty:data.quantity,
          filledQty:result.filledQty,
          remainingQty:result.averageFillPrice,
          status:newOrder.status
        },
        fills:result.fills,
        collateral:found.collateral,
        positions:found.positions,
      });
    }
  } catch (e: any) {
    return res.status(500).json({
      success: false,
      msg: e.message || "Internal Server Error",
    });
  }
});


app.delete("/order",authMiddleware, (req :Request, res:Response) => {
  try{

  }catch (e: any) {
    return res.status(500).json({
      success: false,
      msg: e.message || "Internal Server Error",
    });
  }
});

app.get("/equity/available",authMiddleware, (req, res) => {
  try{


  }catch (e: any) {
    return res.status(500).json({
      success: false,
      msg: e.message || "Internal Server Error",
    });
  }
});


app.get("/positions/open/:marketId",authMiddleware, (req, res) => {
  try{

  }catch (e: any) {
    return res.status(500).json({
      success: false,
      msg: e.message || "Internal Server Error",
    });
  }
});


app.get("/positions/closed/:marketId",authMiddleware, (req, res) => {
  try{

  }catch (e: any) {
    return res.status(500).json({
      success: false,
      msg: e.message || "Internal Server Error",
    });
  }
});


app.get("/orders/open/:marketId", authMiddleware,(req, res) => {
  try{

  }catch (e: any) {
    return res.status(500).json({
      success: false,
      msg: e.message || "Internal Server Error",
    });
  }
});


app.get("/orders/:marketId",authMiddleware, (req, res) => {
  try{

  }catch (e: any) {
    return res.status(500).json({
      success: false,
      msg: e.message || "Internal Server Error",
    });
  }
});


app.get("/fills", (req, res) => {
  try{

  }catch (e: any) {
    return res.status(500).json({
      success: false,
      msg: e.message || "Internal Server Error",
    });
  }
});


app.listen(3000, () => {
  console.log(`running on port 3000`);
});
