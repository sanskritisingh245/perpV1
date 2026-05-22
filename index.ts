import express, { type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { SignupSchema } from "./zod/auth";
import { authMiddleware } from "./middleware";
import { OrderSchema } from "./zod/order";
import { matchAndExecute } from "./helperFunction/helper";
import { addToOrderBook } from "./helperFunction/Orderbook";
import { checkLiquidations, unrealizedPnl } from "./helperFunction/liquidation";
import { success } from "zod";
import { unrealizedPnL } from "./helperFunction/pnl";
import { fa } from "zod/locales";
import bcrypt from "bcryptjs";

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

app.post("/signup", async(req: Request, res: Response) => {
  try {
    const { success, data } = SignupSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).json({
        success: false,
        error: "INVALID_DATA",
      });
    }
    const userId = crypto.randomUUID();

    const password= await bcrypt.hash(data.password, 10)
    const user= users.find(user => user.username === data.username)
    if(user){
      return res.status(400).json({
        success:false,
        error:"USERNAME_ALREADY_EXSIST"
      })
    }
    users.push({
      userId: userId,
      username: data.username,
      password: password,
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

app.post("/signin", async (req: Request, res: Response) => {
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
    const balance = req.body.balance;
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
    found.orders.push({
      orderId: newOrder.orderId,
      market: newOrder.market,
      type: newOrder.side.toUpperCase(),
      qty: newOrder.qty,
      margin: requiredMargin,
      orderType: data.type,   // "limit" | "market" from the schema
      price: data.price,
      status: newOrder.status,
    }); // how to add the completely filled order in this ???

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
    const userId=req.id;
    const orderId=req.query.orderId as string;
    if(!orderId){
      return res.status(404).json({
        success:false,
        error:"ORDER_ID_NOT_FOUND"
      })
    }

    const user=users.find(u=> u.userId === userId);
      if(!user){
        return res.status(400).json({
          success:false,
          error:"USER_NOT_FOUND"
        })
      }


  }catch (e: any) {
    return res.status(500).json({
      success: false,
      msg: e.message || "Internal Server Error",
    });
  }
});

app.get("/equity/available",authMiddleware, (req, res) => {
  try{
      const userId=req.id;
      const user=users.find(u=> u.userId === userId);
      if(!user){
        return res.status(400).json({
          success:false,
          error:"USER_NOT_FOUND"
        })
      }

      const symbol=req.query.symbol as string;
      if(!symbol){
        return res.status(400).json({
          success:false,
          error:"SYMBOL_NOT_FOUND"
        })
      }
      
      let equity = user.collateral.available+user.collateral.locked;
      for(const position of user.positions){
        const book =orderbooks[symbol];
        if(!book) return;
        const markPrice=book.indexPrice;
        equity +=unrealizedPnl(position, markPrice);//equity= collateral + unrelaizedPnl
      }
      res.status(200).json({
        success:true,
        data:equity
      })
    }catch (e: any) {
    return res.status(500).json({
      success: false,
      msg: e.message || "Internal Server Error",
    });
  }
});


app.get("/positions/open/:marketId",authMiddleware, (req, res) => {
  try{
    const userId=req.id;
    const marketId=req.params.marketId;

    const user= users.find(user => user.userId === userId);
    if(!user){
      return res.status(400).json({
        success:false,
        error:"USER_NOT_FOUND"
      })
    }

    for(const position of user.positions){
      if(position.market !== marketId) {
        return res.status(400).json({
          success:false,
          error:"NO_OPEN_POSITION"
        })
      }

      const book=orderbooks[marketId];
      if(!book){
        return res.status(400).json({
          success:false,
          error:"MARKET_NOT_FOUND"
        })
      }
      const markPrice=book.indexPrice;
      const pnl=unrealizedPnl(position, markPrice)
      const positionValue=markPrice*position.qty;
      const equity=position.margin+pnl;

      return res.status(200).json({
        success:true,
        data:{
          market:position.market,
          side:position.type,
          qty:position.qty,
          markPrice:markPrice,
          unrealizedPnl:pnl,
          margin:position.margin,
          liquidationPrice:position.liquidationPrice,
          positionValue: positionValue,
          equity:equity
        }
      })

    }
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
    const userId=req.id;
    const marketId=req.params.marketId as string;
    if(!marketId){
      return res.status(400).json({
        success:false,
        error:"MARKET_ID_REQUIRED"
      })
    }

    const user= users.find(user => user.userId === userId);
    if(!user){
      return res.status(400).json({
        success:false,
        error:"USER_NOT_FOUND"
      })
    }

    if(!orderbooks[marketId]){
      return res.status(404).json({
        success:false,
        error:"MARKET_NOT_FOUND"
      })
    }

    const openOrders = user.orders.filter(
      order => order.market === marketId && order.status === "open"
    );

    return res.status(200).json({
      success:true,
      data: openOrders
    })



  }catch (e: any) {
    return res.status(500).json({
      success: false,
      msg: e.message || "Internal Server Error",
    });
  }
});


app.get("/orders/:marketId",authMiddleware, (req, res) => {
  try{
    const userId=req.id;

    const marketId=req.params.marketId as string;
    if(!marketId){
      return res.status(400).json({
        success:false,
        error:"MARKET_ID_REQUIRED"
      })
    }

    const user= users.find(user=> user.userId === userId)
    if(!user){
      return res.status(400).json({
        success:false,
        error:"USER_NOT_FOUND"
      })
    }

    if(!orderbooks[marketId]){
      return res.status(404).json({
        success:false,
        error:"MARKET_NOT_FOUND"
      })
    }

    const orders = user.orders.filter(
      order => order.market === marketId 
    );

    return res.status(200).json({
      success:true,
      data:orders
    })

  }catch (e: any) {
    return res.status(500).json({
      success: false,
      msg: e.message || "Internal Server Error",
    });
  }
});


app.get("/fills", (req, res) => {
  try{
    return res.status(200).json({
      success:true,
      data:fills
    })
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
