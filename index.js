#!/usr/bin/env node
////////////////////////
///////SERVER///////////
////////////////////////
const fs = require('fs');
const express = require('express');
const app = express();
const cors = require('cors');



///////////////////////      LIVE        //////////////////////////

// const privKey = fs.readFileSync('/etc/nginx/ssl/privkey.pem');
// const cert = fs.readFileSync('/etc/nginx/ssl/fullchain.pem');

// const http = require('https').Server({key: privKey, cert: cert}, app);
// const io = require("socket.io")(http, 

// {
// cors: {
//     origin: "https://server1.cyrilmorin.fr",
//     methods: ["GET", "POST"],
//   }
// })

//////////////////////////////////////////////////////////////////////////

//////////////////////      LOCAL       ////////////////////////////////

const http = require('http').Server(app)
const io = require("socket.io")(http,

    {
        cors: {
            origin: "http://localhost:3000",
            methods: ["GET", "POST"],
        }
    })


//////////////////////////////////////////////////////////////////////////


const port = process.env.PORT || 3002;
////////////////////////
///////BCRYPT///////////
////////////////////////
const bcrypt = require('bcryptjs');
const saltRounds = 10;
////////////////////////
/////////DB/////////////
////////////////////////
const mongoose = require('mongoose');
const Room = require('./roomschema');
mongoose.connect('mongodb://localhost/rooms', { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on('error', (err) => { console.log(err) });
db.once('open', function () {
    console.log("db opened !!!")
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded());

let requestList = []

http.listen(port, () => {
    console.log(`Socket.IO server running at http://localhost:${port}/`);
});

io.on('connection', (socket) => {
    socket.on('room creation', msg => {
        bcrypt.genSalt(saltRounds, (err, salt) => {
            bcrypt.hash(msg.roomPassword, salt, (err, hash) => {
                msg.roomPassword = hash
                const newRoom = new Room(msg);
                Room.find({ roomName: newRoom.roomName }, (err, results) => {
                    if (err) {
                        socket.emit('error', 'server error')
                    } else if (results.length > 0) {
                        socket.emit('error', 'a room with this name already exists')
                    }
                    else {
                        newRoom.save((err, newRoom) => {
                            if (err) {
                                socket.emit('error', 'server error')
                            } else {
                                socket.emit('room created', msg.roomName)
                                socket.join(msg.roomName)
                            }
                        })
                    }
                })
            });
        });
    })
    socket.on('get room list', () => {
        Room.find({}, (err, rooms) => {
            if (err) {
                socket.emit('error', 'server error')
            } else {
                socket.emit('set room list', rooms)
            }
        })
    })
    socket.on('enter room free', (userData) => {
        Room.findOne({ roomName: userData.roomName }, (err, room) => {
            if (err) {
                socket.emit('error', 'server error')
            } else if (Object.keys(room).length === 0) {
                socket.emit('error', 'This room does not exist anymore')
            } else if (room.roomAccess !== 'free') {
                socket.emit('error', 'BAD REQUEST')
            } else {
                addUser(userData.roomName, userData.id, userData.nickName, userData.pubKey, socket)
            }
        })
    })
    socket.on('enter room password', (userData) => {
        Room.findOne({ roomName: userData.roomName }, (err, room) => {
            if (err) {
                socket.emit('error', 'server error')
            } else if (Object.keys(room).length === 0) {
                socket.emit('error', 'This room does not exist anymore')
            } else if (room.roomAccess !== 'password') {
                socket.emit('error', 'BAD REQUEST')
            } else {
                checkPassword(userData, socket)
            }
        })
    })
    socket.on('enter room request', (userData) => {
        Room.findOne({ roomName: userData.roomName }, (err, room) => {
            if (err) {
                socket.emit('error', 'server error')
            } else if (Object.keys(room).length === 0) {
                socket.emit('error', 'This room does not exist anymore')
            } else if (room.roomAccess !== 'request') {
                socket.emit('error', 'BAD REQUEST')
            } else {
                requestList.push(socket)
                io.to(room.roomOwner).emit('entry requested', userData)
            }
        })
    })
    socket.on('request accepted', (user) => {
        function accept(user) {
            let userSocket = requestList.find(item => item.id === user.id)
            addUser(user.roomName, user.id, user.nickName, user.pubKey, userSocket)
        }
        checkIfAdmin(user.roomName, socket.id, user, accept)
    })
    socket.on('request denied', (user) => {
        function deny(user) {
            let userSocket = requestList.find(item => item.id === user.id)
            userSocket.emit('access denied', 'The admin denied you access to the room')
        }
        checkIfAdmin(user.roomName, socket.id, user, deny)
    })
    socket.on('chat message sent', (msg) => {
        Room.findOne({ roomName: msg.roomName }, (err, room) => {
            if (err) {
                socket.emit('error', 'server error')
            } else if (Object.keys(room).length === 0) {
                socket.emit('error', 'This room does not exist anymore')
            } else {
                const userlst = room.roomUsers.map(item => item.id);
                let check = userlst.includes(socket.id);
                if (check) {
                    msg.msg.forEach(item => {
                        console.log(msg.sender)
                        user = room.roomUsers.find((elem) => elem.nickName === item.user)
                        socket.to(user.id).emit('chat message received',
                            { msg: item.msg, sender: msg.sender })
                    })
                }
            }
        })
    })
})

function checkIfAdmin(roomName, id, user, action) {
    Room.findOne({roomName: roomName}, (err, room) => {
        if (err) {
            socket.emit('error', 'server error')
        } else if (Object.keys(room).length === 0) {
            socket.emit('error', 'This room does not exist anymore')
        } else if (room.roomOwner !== id) {
            socket.emit('error', 'BAD REQUEST')
        } else {
            action(user)
        }
    })
}

function checkPassword(msg, socket) {
    Room.findOne({ roomName: msg.roomName }, (err, room) => {
        bcrypt.compare(msg.password, room.roomPassword, (err, res) => {
            if (err) {
                socket.emit('error', 'server error')
            } else if (res === true) {
                socket.join(room.roomName)
                addUser(msg.roomName, socket.id, msg.nickName, msg.pubKey, socket)
            } else {
                socket.emit('error', 'invalid password')
            }
        })
    })
}


function addUser(roomName, id, nickName, pubKey, socket) {
    const tmp = []
    let ok = true;
    Room.find({ roomName: roomName }, (err, results) => {
        if (err) {
            io.to(id).emit('errMsg', 'error on db, room not found')
        } else {
            console.log(tmp)
            tmp.push(...results[0].roomUsers)
            console.log(tmp)

            tmp.forEach(item => {
                if (item.nickName === nickName) {
                    ok = false
                }
            })
            console.log(tmp)

            if (ok) {
                tmp.push({
                    nickName: nickName,
                    id: id,
                    pubKey: pubKey
                })
            console.log('yo')

                Room.updateOne({ roomName: roomName }, { roomUsers: tmp }, (err, results) => {
                    if (err) {
                        io.to(id).emit('errMsg', 'error while updating users list')
                    } else {
                        const listWithouID = tmp.map((item) => {
                            return {
                                nickName: item.nickName,
                                pubKey: item.pubKey
                            }
                        })
                        socket.join(roomName)
                        socket.emit('room joined')
                        io.to(roomName).emit('update user list', [...listWithouID])
                        let tmp2 = requestList.filter(item => item.id !== id)
                        requestList = [...tmp2]
                    }
                })
            } else {
                socket.emit('error', 'This nickname is already taken')
            }
        }
    })
}

// io.on('connection', (socket) => {
//     socket.on('chat message sent', (msg) => {
//         Room.find({ roomName: msg.roomName }, (err, results) => {
//             if (results.length === 0) {
//                 io.to(socket.id).emit('errMsg', 'the room does not exit anymore')
//             } else {
//                 const userlst = [...results[0].roomUsers];
//                 let check = false;
//                 for (let i = 0; i < userlst.length; i++) {
//                     if (userlst[i].id === socket.id) {
//                         if (userlst[i].nickName === msg.sender) {
//                             check = true
//                         }
//                     }
//                 }
//                 if (check) {
//                     // socket.to(msg.roomName).emit('chat message received',
//                     //     { msg: msg.msg, sender: msg.sender })
//                     msg.msg.forEach(item => {
//                         user = userlst.find((elem) => elem.nickName === item.user)
//                         socket.to(user.id).emit('chat message received',
//                             { msg: item.msg, sender: msg.sender })
//                     });
//                 }
//             }
//         })

//     })
//     socket.on('enter room', (msg) => {
//         console.log('msg in enter room :')
//         console.log(msg)
//         Room.find({ roomName: msg.roomName }, (err, results) => {
//             if (err) {
//                 io.to(msg.id).emit('errMsg', 'err on database')
//             } else if (results.length === 0) {
//                 io.to(msg.id).emit('errMsg', 'room not found')
//             } else {
//                 if (msg.id === results[0].roomOwner) {
//                     socket.join(results[0].roomName)
//                     io.to(msg.id).emit('room entered admin',
//                         { srvMsg: `you have entered the room : ${results[0].roomName}` })
//                     io.to(msg.roomName).emit('update user list',
//                         [{ nickName: msg.nickName, owner: true, pubKey: msg.pubKey }])
//                 } else {
//                     if (results[0].roomAccess === 'password') {
//                         io.to(msg.id).emit('user check',
//                             'password')
//                     } else if (results[0].roomAccess === 'request') {
//                         io.to(msg.id).emit('user check',
//                             'request')
//                             console.log("request case")
//                         io.to(results[0].roomOwner).emit('access requested', msg)
//                     } else {
//                         io.to(msg.id).emit('user check',
//                             'free')
//                     }
//                 }

//             }
//         })
//     })

//     socket.on('check password', (msg) => {
//         Room.find({ roomName: msg.roomName }, (err, results) => {
//             bcrypt.compare(msg.password, results[0].roomPassword, (err, res) => {
//                 if (res === true) {
//                     io.to(socket.id).emit('password response', 'true')
//                     socket.join(results[0].roomName)
//                     addUser(msg.roomName, socket.id, false, msg.nickName, msg.pubKey)
//                 } else {
//                     io.to(socket.id).emit('password response', 'false')
//                 }
//             })
//         })
//     })

//     socket.on("disconnecting", (reason) => {
//         let user;
//         Room.findOne({ roomName: Array.from(socket.rooms)[1] },
//             (err, results) => {
//                 if (err) {
//                     console.log(err)
//                 } else {
//                     if (results) {
//                         console.log(results)
//                         user = results.roomUsers.find((item) => {
//                             return item.id === socket.id
//                         })
//                     } else {
//                         console.log("the room does not exist anymore")
//                     }

//                 }
//             }).then((res) => {
//                 if (res) {
//                     deleteUser(res.roomUsers, user, res.roomName)
//                 }
//             })
//     });
// })

// function deleteUser(userList, user, roomName) {
//     if (user.owner) {
//         console.log('is owner')
//         Room.deleteOne({ roomName: roomName }, (e, r) => {
//             if (e) {
//                 console.log(e)
//             } else {
//                 console.log('room deleted :')
//                 console.log(r)
//             }
//         })
//     } else {
//         console.log('is NOT owner')
//         let tmp = userList.filter((item) => item.id !== user.id)
//         Room.updateOne({ roomName: roomName }, { roomUsers: tmp }, (err, results) => {
//             if (err) {
//                 io.to(id).emit('errMsg', 'error while updating users list')
//             } else {
//                 const listWithouID = tmp.map((item) => {
//                     return {
//                         nickName: item.nickName,
//                         owner: item.owner,
//                         pubKey: item.pubKey
//                     }
//                 })
//                 io.to(roomName).emit('update user list', [...listWithouID])
//             }
//         })
//     }
// }

// function addUser(roomName, id, nickName, pubKey) {
//     const tmp = []
//     Room.find({ roomName: roomName }, (err, results) => {
//         if (err) {
//             io.to(id).emit('errMsg', 'error on db, room not found')
//         } else {
//             tmp.push(...results[0].roomUsers)
//             tmp.push({
//                 nickName: nickName,
//                 id: id,
//                 pubKey: pubKey
//             })
//             Room.updateOne({ roomName: roomName }, { roomUsers: tmp }, (err, results) => {
//                 if (err) {
//                     io.to(id).emit('errMsg', 'error while updating users list')
//                 } else {
//                     const listWithouID = tmp.map((item) => {
//                         return {
//                             nickName: item.nickName,
//                             pubKey: item.pubKey
//                         }
//                     })
//                     io.to(roomName).emit('update user list', [...listWithouID])
//                 }
//             })
//         }
//     })
// }

// app.get('/getrooms', (req, res) => {
//     Room.find({}, (err, docs) => {
//         res.status(200).send(docs)
//     })

// })

// app.post('/createroom', (req, res) => {
//     bcrypt.genSalt(saltRounds, (err, salt) => {
//         bcrypt.hash(req.body.roomPassword, salt, (err, hash) => {
//             req.body.roomPassword = hash
//             const newRoom = new Room(req.body);
//             Room.find({ roomName: newRoom.roomName }, (err, results) => {
//                 if (err) {
//                     res.status(500).send({
//                         msg: "a problem occured on the server"
//                     })
//                 } else if (results.length > 0) {
//                     res.status(400).send({
//                         msg: "a room with this name already exists"
//                     })
//                 }
//                 else {
//                     newRoom.save((err, newRoom) => {
//                         if (err) {
//                             res.status(500).send({
//                                 msg: "a problem occured on the server"
//                             })
//                         } else {
//                             res.status(201).send({
//                                 msg: "the room has been created"
//                             })
//                         }
//                     })
//                 }
//             })
//         });
//     });
// })


//Memo Socket IO

// // sending to sender-client only
// socket.emit('message', "this is a test");

// // sending to all clients, include sender
// io.emit('message', "this is a test");

// // sending to all clients except sender
// socket.broadcast.emit('message', "this is a test");

// // sending to all clients in 'game' room(channel) except sender
// socket.broadcast.to('game').emit('message', 'nice game');

// // sending to all clients in 'game' room(channel), include sender
// io.in('game').emit('message', 'cool game');

// // sending to sender client, only if they are in 'game' room(channel)
// socket.to('game').emit('message', 'enjoy the game');

// // sending to all clients in namespace 'myNamespace', include sender
// io.of('myNamespace').emit('message', 'gg');

// // sending to individual socketid
// socket.broadcast.to(socketid).emit('message', 'for your eyes only');

// // list socketid
// for (var socketid in io.sockets.sockets) {}
//  OR
// Object.keys(io.sockets.sockets).forEach((socketid) => {});
