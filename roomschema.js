let mongoose = require("mongoose");
const { Schema } = mongoose;

const roomSchema = new Schema({
    roomName: String,
    roomUsers: Array,
    roomAccess: String,
    roomPassword: String,
    roomOwner: String,
    blockedUsers: Array
})

let room = module.exports =  mongoose.model('room', roomSchema);
