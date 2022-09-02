const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// middleware 
app.use(cors());
app.use(express.json());
app.use(
    cors({
      origin: "*",
    })
  );

// middleware for verifying token 
const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized User' });
    }
    else {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
            if (err) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            else {
                req.decoded = decoded;
                next();
            }
        });
    }
}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ox5bc.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        client.connect();
        const toolCollection = client.db('craft-owl').collection('tools');
        const userCollection = client.db('craft-owl').collection('users');
        const orderCollection = client.db('craft-owl').collection('orders');
        const reviewCollection = client.db('craft-owl').collection('reviews');

        // middleware for verifying admin 
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterInfo = await userCollection.findOne({ email: requester });
            const isAdmin = requesterInfo?.role === "admin";
            if (!isAdmin) {
                return res.status(403).send({ message: 'Forbidden Accessss' });
            }
            else {
                next();
            }
        };

        // method for managing user by an admin 

        // to check if a user is admin or not 
        app.get('/admin/user/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const userInfo = await userCollection.findOne({ email: email });
            const isAdmin = userInfo?.role === "admin";
            res.send({ admin: isAdmin });
        });

        // to make a user an admin 
        app.patch('/admin/user/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        // to get all users 
        app.get('/user', verifyJWT, verifyAdmin, async (req, res) => {
            const users = await userCollection.find().sort({ "email": 1 }).toArray();
            res.send(users);
        });

        // method for managing users by users theme selves 

        // to insert a new user and update the previous user into database and give the user an access token 
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    email: email
                }
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
            res.send({ result, token });
        });

        // to update an user information 
        app.patch('/update-user/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const userInfo = req.body;
            const filter = { email: email };
            const updateDoc = {
                $set: userInfo
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // to get a particular user 
        app.get('/user/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            res.send(user);
        })

        // getting tools from database 

        // to get maximum 6 tools from database 
        app.get('/tool', async (req, res) => {
            const tools = (await toolCollection.find().toArray()).reverse().slice(0, 6);
            res.send(tools);
        });

        // to get all the tools from database 
        app.get('/all-tools', async (req, res) => {
            const tools = await toolCollection.find().toArray();
            res.send(tools);
        });

        app.get('/cheapest-tool', async (req, res) => {
            const cursor = toolCollection.find().sort({ price: 1 }).limit(1);
            const cheapestTool = await cursor.toArray();
            res.send(cheapestTool);
        });

        // method for managing tools by an admin 

        // to delete a particular tool 
        app.delete('/tool/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await toolCollection.deleteOne(filter);
            res.send(result);
        });

        // to get a particular tool from db 
        app.get('/tool/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const tool = await toolCollection.findOne(query);
            res.send(tool);
        });

        // to insert a new tool in db 
        app.post('/tool', verifyJWT, async (req, res) => {
            const toolInfo = req.body;
            const result = await toolCollection.insertOne(toolInfo);
            res.send(result);
        })

        // method for managing order by a user 

        // to post a order into database 
        app.post('/order', verifyJWT, async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            res.send(result);
        });

        // to get order of a particular user 
        app.get('/order/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const orders = await orderCollection.find(query).toArray();
            res.send(orders);
        });

        // to get one order by the orders _id 
        app.get('/order', verifyJWT, async (req, res) => {
            const { id, email } = req.query;
            const query = { _id: ObjectId(id), email: email };
            const order = await orderCollection.findOne(query);
            res.send(order);
        });

        // to delete an order by user 
        app.delete('/order', verifyJWT, async (req, res) => {
            const { id, email } = req.query;
            const filter = { _id: ObjectId(id), email: email };
            const result = await orderCollection.deleteOne(filter);
            res.send(result);
        });

        // connecting the payment intent 
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { price } = req.body;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: parseFloat(price) * 100,
                currency: "usd",
                payment_method_types: [
                    "card"
                ],
            });

            res.send({ clientSecret: paymentIntent.client_secret });
        });

        // to update the order after payment 
        app.patch('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const transactionId = req.body.transactionId;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    transactionId: transactionId,
                    status: 'pending'
                }
            };
            const result = await orderCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // method for managing orders by an admin 

        // to get all order by an admin 
        app.get('/admin/order', verifyJWT, verifyAdmin, async (req, res) => {
            const orders = await orderCollection.find().toArray();
            res.send(orders);
        });

        // updating an order from paid to shipped by an admin
        app.patch('/admin/order/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id), status: 'pending' };
            const updateDoc = {
                $set: {
                    status: 'shipped'
                }
            };
            const result = await orderCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // to delete an unpaid order by an admin 
        app.delete('/admin/order/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id), status: 'unpaid' };
            const result = await orderCollection.deleteOne(filter);
            res.send(result);
        })


        // method for managing review by an user 

        // to store a review in reviewCollection 
        app.put('/review', verifyJWT, async (req, res) => {
            const review = req.body;
            const filter = { email: review.email };
            const options = { upsert: true };
            const updateDoc = {
                $set: review
            };
            const result = await reviewCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        app.get('/review', async (req, res) => {
            const reviews = await reviewCollection.find().toArray();
            const reverseReviews = reviews.reverse();
            res.send(reverseReviews);
        });


    }
    finally { }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Started');
});

app.listen(port, () => console.log('Listening to Craft Owl Server at', port));
