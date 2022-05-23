const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;

// middleware 
app.use(cors());
app.use(express.json());

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
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ result, token });
        });

        // to get all the tools from database 
        app.get('/tool', async (req, res) => {
            const tools = await toolCollection.find().toArray();
            const reverseTools = tools.reverse();
            res.send(reverseTools);
        });

        // to get a particular tool from db 
        app.get('/tool/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const tool = await toolCollection.findOne(query);
            res.send(tool);
        });

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

        app.delete('/order', verifyJWT, async (req, res) => {
            const { id, email } = req.query;
            const filter = { _id: ObjectId(id), email: email };
            const result = await orderCollection.deleteOne(filter);
            res.send(result);
        })


    }
    finally { }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Started');
});

app.listen(port, () => console.log('Listening to Craft Owl at', port));
