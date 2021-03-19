import React from "react";
import {
    HashRouter as Router,
    Switch,
    Route,
    Link,
    Redirect,
    useRouteMatch,
    useLocation,
    useParams
} from "react-router-dom";
import { useState } from "react";

function Create(params) {
    const [nickName, setNickName] = useState('');
    const [roomName, setRoomName] = useState('');
    const [password, setPassword] = useState('');

    function handleChangeNick(e) {
        setNickName(e.target.value);
    }
    function handleChangeRoom(e) {
        setRoomName(e.target.value);
    }
    function handleChangePass(e) {
        setPassword(e.target.value);
    }

    function handleSubmit(e) {
        fetch('http://localhost:3002/createroom', {
            method: 'POST',
            
            body: JSON.stringify({
                nickName: "toto",
                roomName: roomName,
                password: password
            }),
            headers: {
                'Content-Type': 'application/json'
              },
        })
            .then((res) => console.log(res))
        e.preventDefault();
    }


    return (
        <div className="create-wrapper">
            <form onSubmit={handleSubmit}>
                <label htmlFor="nickName">Enter your nickname here :</label>
                <input type="text"
                    id="nickName"
                    name="nickName"
                    value={nickName}
                    onChange={handleChangeNick}></input>
                    
                <label htmlFor="roomName">Enter your room name here :</label>
                <input type="text"
                    id="roomName"
                    name="roomName"
                    value={roomName}
                    onChange={handleChangeRoom}></input>
                    
                <label htmlFor="password">Room password (leave blank if not needed)</label>
                <input type="text"
                    id="password"
                    name="password"
                    value={password}
                    onChange={handleChangePass}></input>                    
                <input type="hidden" value={params.id} name="id"></input>
                <button type="submit">Create Room !</button>
            </form>
            <h1>nick: {nickName}</h1>
        </div>
        
    );
}

export default Create;