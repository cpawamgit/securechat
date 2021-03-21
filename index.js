////////////////////////
///////SERVER///////////
////////////////////////
const express = require('express');
const app = express();
const cors = require('cors');
const http = require('http').Server(app);
const env = require('./env.json')
const io = require("socket.io")(http, {
    cors: {
        origin: env.prod.host,
        methods: ["GET", "POST"]
    }
});
const port = process.env.PORT || env.prod.port;
////////////////////////
/////  BCRYPT  /////////
////////////////////////
const bcrypt = require('bcrypt');
const saltRounds = 10;
////////////////////////
///////  DB  ///////////
////////////////////////
const mongoose = require('mongoose');
const Room = require('./roomschema');
const { endianness } = require('os');
mongoose.connect('mongodb://localhost/rooms', { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on('error', (err) => { console.log(err) });
db.once('open', function () {
    console.log("db opened !!!")
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded());
// const toto = new Room({
//     roomname: 'totoroom',
//     roomId: 'iddetoto',
//     roomUsers: ['toto', 'user2']
// })

// toto.save((err, toto) => {
//     if (err){
//         console.log(err)
//     } else {
//         console.log('toto has been saved')
//     }
// })
io.on('connection', (socket) => {
    console.log(socket.id)
    socket.on('chat message sent', (msg) => {
        console.log("message sent")
        Room.find({ roomName: msg.roomName }, (err, results) => {
            const userlst = [...results[0].roomUsers];
            console.log('userlst : ')
            console.log(userlst)
            let check = false;
            for (let i = 0; i < userlst.length; i++) {
                if (userlst[i].id === socket.id) {
                    check = true
                }
                console.log('userlst[i].id: ')
                    console.log(userlst[i].id)
                    console.log('socked id:')
                    console.log(socket.id)
            }
            if (check) {
                socket.to(msg.roomName).emit('chat message received',
                    { msg: msg.msg, sender: msg.sender })
            }
        })

    })
    socket.on('enter room', (msg) => {
        console.log('enter room called')
        Room.find({ roomName: msg.roomName }, (err, results) => {
            if (err) {
                io.to(msg.id).emit('errMsg', 'err on database')
            } else if (results.length === 0) {
                console.log('results length 0')
                io.to(msg.id).emit('errMsg', 'room not found')
            } else {
                if (msg.id === results[0].roomOwner) {
                    socket.join(results[0].roomName)
                    io.to(msg.id).emit('room entered admin',
                        { srvMsg: `you have entered the room : ${results[0].roomName}` })
                    io.to(msg.roomName).emit('update user list',
                        [{ nickName: msg.nickName, owner: true }])
                    console.log("nick admin: ")
                    console.log(msg.nickName)
                } else {
                    console.log('access check')
                    if (results[0].roomAccess === 'password') {
                        console.log('password case')
                        io.to(msg.id).emit('user check',
                            'password')
                    } else if (results[0].roomAccess === 'request') {
                        io.to(msg.id).emit('user check',
                            'request')
                    } else {
                        io.to(msg.id).emit('user check',
                            'forbidden')
                    }
                }

            }
        })
    })

    socket.on('check password', (msg) => {
        Room.find({ roomName: msg.roomName }, (err, results) => {
            bcrypt.compare(msg.password, results[0].roomPassword, (err, res) => {
                if (res === true) {
                    io.to(socket.id).emit('password response', 'true')
                    socket.join(results[0].roomName)
                    addUser(msg.roomName, socket.id, false, msg.nickName)
                } else {
                    io.to(socket.id).emit('password response', 'false')
                }
            })
        })
    })
    socket.on("disconnect", (reason) => {
        console.log(reason);
        Room.deleteMany({ roomOwner: socket.id }, (err) => {
            if (err) {
                console.log("error")
            }
            else {
                console.log("room deleted")
            }
        });
    });
});

function addUser(roomName, id, owner, nickName) {
    const tmp = []
    Room.find({ roomName: roomName }, (err, results) => {
        if (err) {
            io.to(id).emit('errMsg', 'error on db, room not found')
        } else {
            tmp.push(...results[0].roomUsers)
            tmp.push({
                nickName: nickName,
                id: id,
                owner: owner
            })
            Room.updateOne({ roomName: roomName }, { roomUsers: tmp }, (err, results) => {
                if (err) {
                    io.to(id).emit('errMsg', 'error while updating users list')
                    console.log('error')
                } else {
                    const listWithouID = tmp.map((item) => {
                        return {
                            nickName: item.nickName,
                            owner: item.owner
                        }
                    })
                    io.to(roomName).emit('update user list', [...listWithouID])
                    console.log('tmp : ')
                    console.log(tmp)
                }
            })
        }
    })
}

// app.get('/getroom', (req, res) => {
//     Room.find({roomname: 'totoroom'}, (err, results) => {
//         res.json(results);
//     });
// })
app.get('/getrooms', (req, res) => {
    Room.find({}, (err, docs) => {
        res.status(200).send(docs)
    })

})

app.post('/createroom', (req, res) => {
    bcrypt.genSalt(saltRounds, (err, salt) => {
        bcrypt.hash(req.body.roomPassword, salt, (err, hash) => {
            req.body.roomPassword = hash
            const newRoom = new Room(req.body);
            Room.find({ roomName: newRoom.roomName }, (err, results) => {
                if (err) {
                    res.status(500).send({
                        msg: "a problem occured on the server"
                    })
                } else if (results.length > 0) {
                    res.status(400).send({
                        msg: "a room with this name already exists"
                    })
                }
                else {
                    newRoom.save((err, newRoom) => {
                        if (err) {
                            res.status(500).send({
                                msg: "a problem occured on the server"
                            })
                        } else {
                            res.status(201).send({
                                msg: "the room has been created"
                            })
                        }
                    })
                }
            })
        });
    });


    // console.log("room : " + req.body.roomName);
    // console.log("user nick : " + req.body.roomUsers[0].nickName);
    // console.log("user id : " + req.body.roomUsers[0].id);
    // console.log("user own : " + req.body.roomUsers[0].owner);
    // console.log("access : " + req.body.roomAccess);
    // console.log("password : " + req.body.roomPassword);
    // Room.find({roomName: req.roomName}), (err, results) => {
    //     if (results.roomName === req.roomName){
    //         res.status(400).send({
    //             message: "the room name already exists"
    //         })
    //     } else if (!err) {
    //         //to do after having check that the db didnt send error
    //         res.status(201).send({
    //             message: "the room has been created"
    //         })
    //     }
    // }
})

http.listen(port, () => {
    console.log(`Socket.IO server running at http://localhost:${port}/`);
});