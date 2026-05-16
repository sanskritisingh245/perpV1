import express , {type Request , type Response} from "express";
import jwt from "jsonwebtoken";
import { SignupSchema} from "./zod/auth";
import { authMiddleware } from "./middleware";
import { OrderSchema } from "./zod/order";
import { excuteTrade, findMatchingOrders } from "./helperFunction/helper";

const JWT_SECRET=process.env.JWT_SECRET||"";


const app = express();
app.use(express.json());


export const users = [{
    userId: "1",
    username: "harkirat",
    password: "123123",
    collateral: {
         available: 2000,
         locked: 1000
    },
     positions: [
        { market: "SOL", type: "LONG", qty: 10, margin: 500,pnL: 200, liquidationPrice: 80, averagePrice: 90 },
        { market: "ETH", type: "SHORT", qty: 1, margin: 500,pnl:100, liquidationPrice: 2000, averagePrice: 1900 }
    ],
    orders: [
        { orderId: 1, market: "SOL", type: "LONG", qty: 10, margin: 500, orderType: "limit", price: 90, status: "filled" },
        { orderId: 2, market: "ETH", type: "SHORT", qty: 10, margin: 500, orderType: "limit", price: 1900, status: "filled" },
        { orderId: 3, market: "BTC", type: "LONG", qty: 10, margin: 500, orderType: "limit", price: 1900, status: "cancelled" },
    ]
}, {
    userId: "2",
    username: "raman",
    password: "123123",
    collateral: {
         available: 2000,
         locked: 2000
    },
    positions: [
        { market: "SOL", type: "SHORT", qty: 10,  margin: 1000, liquidationPrice: 80, pnL: 200, averagePrice: 90 },
        { market: "ETH", type: "LONG", qty: 1, margin: 1000, liquidationPrice: 2000, pnL: -100, averagePrice: 1900 }
    ],
    orders: [
        { orderId: 10, market: "SOL", type: "SHORT", qty: 10, margin: 500, orderType: "market", price: 90, status: "filled" },
        { orderId: 11, market: "ETH", type: "LONG", qty: 10, margin: 500, orderType: "market", price: 1900, status: "filled" },
        { orderId: 12, market: "ZEC", type: "LONG", qty: 10, margin: 500, orderType: "limit", price: 1900, status: "open" },
    ]
}];

type Bid = {
    availableQty: number,
    openOrders: { userId: number, qty: number, filledQty: number, orderId: number, createdAt: Date }[]
}

type Orderbook = {
    bids: Record<string, Bid>,
    asks: Record<string, Bid>,
    lastTradedPrice: number,
    indexPrice: number
}

type Orderbooks = Record<string, Orderbook>

export const orderbooks: Orderbooks = {
     SOL: { bids: {}, asks: {}, lastTradedPrice: 90, indexPrice: 90.01 },
     ETH: { bids: {}, asks: {}, lastTradedPrice: 1900, indexPrice: 1899.9 }
}

const fills = [{
    maker: 1,
    taker: 2,
    market: "SOL",
    qty: 10,
    price: 90,
    long: 1,
    short: 2
}, {
    maker: 1,
    taker: 2,
    market: "ETH",
    qty: 1,
    price: 1900,
    long: 2,
    short: 1
}];


app.post("/signup", (req:Request , res:Response)=>{
    try{
        const {success, data}= SignupSchema.safeParse(req.body);
        if(!success){
            return res.status(400).json({
                success:false, 
                error:"INVALID_DATA"
            })
        }
        const userId=crypto.randomUUID();
        users.push({
            userId: userId,
            username: data.username,
            password: data.password,
            collateral: {
                available: 0,
                locked: 0
            },
            positions: [],
            orders: []
        });
    
        return res.status(201).json({
            success: true,
            userId
        });
    }catch(e:any){
        return res.status(500).json({
        success: false,
        msg: e.message || "Internal Server Error",
      });
    }
})

app.post("/signin", (req:Request , res:Response)=>{
    try{
        const userId = req.body.userId;
        if(!userId){
            return res.status(400).json({
                success:false,
                error:"PLEASE_PROVIDE_USERID"
            })
        }
    
        const found = users.find(user=>user.userId === userId)
        if(!found){
            return res.status(400).json({
                success:false,
                error:"USER_NOT_FOUND"
            })
        }
        const token =jwt.sign({
            id:found.userId , 
            username:found.username
        },JWT_SECRET)

        return res.status(201).json({
            success: true,
            data:token,
            msg:"SUCCESSFULLY_SIGNEDIN"
        });

    }catch(e:any){
        return res.status(500).json({
        success: false,
        msg: e.message || "Internal Server Error",
      });
    } 
})

app.post("/onramp", authMiddleware,(req:Request, res:Response) => {
    try{
        const userId=req.id;
        const balance = req.body.Balance;
        if(!balance){
            return res.status(400).json({
                success:false,
                error:"PLEASE_PROVIDE_BALANCE"
            })
        }

        const user=users.find(user => user.userId === userId)
        if(!user){
            return res.status(404).json({
                success:false,
                error:"USER_NOT_FOUND"
            })
        }

        let total = user.collateral.available + balance
        user.collateral.available=total;

        //console.log("yhgsjckl", user)
        return res.status(200).json({
            success:true,
            msg:"BALANCE_UPDATED"
        })

    }catch(e:any){
        return res.status(500).json({
        success: false,
        msg: e.message || "Internal Server Error",
      });
    } 
})

app.post("/order", authMiddleware , (req:Request, res:Response)=>{
    try{
        const userId=req.id;
        const{success, data}=OrderSchema.safeParse(req.body);
        if(!success){
            return res.status(400).json({
                success:false, 
                error:"INVALID_DATA"
            })
        }
        
        const found = users.find(user=>user.userId === userId)
        if(!found){
            return res.status(400).json({
                success:false,
                error:"USER_NOT_FOUND"
            })
        }
        const balance= found.collateral.available;

        const positionSize=data.price * data.quantity;
        const requiredMargin=positionSize / data.leverage;
        
        if(balance < requiredMargin){
            return res.status(400).json({
                success:false,
                error:"NOT_ENOUGH_BALANCE"
            })
        }
        found.collateral.available -=requiredMargin;
        found.collateral.locked +=requiredMargin;
        

        const match = findMatchingOrders(userId ,data.symbol , data.side , data.quantity , data.price , data.leverage);
        if(match){
            //excuteTrade(data.symbol , data.side , data.quantity , data.price, match)
        }
       


        found.positions.push({
            market: data.symbol,
            type: data.side,
            qty: data.quantity,
            margin: requiredMargin,
            liquidationPrice:0,
            pnL: 0,
            averagePrice: data.price,
        });


        
        
    }catch(e:any){
        return res.status(500).json({
        success: false,
        msg: e.message || "Internal Server Error",
      });
    } 
})



app.listen(3000, ()=>{
    console.log(`running on port 3000`);
});
