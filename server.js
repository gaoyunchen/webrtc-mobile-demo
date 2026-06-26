const express = require('express');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = https.createServer({
    key: fs.readFileSync('certs/key.pem'),
    cert: fs.readFileSync('certs/cert.pem')
}, app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));

const rooms = {};

io.on('connection', socket => {
    console.log(`[连接] ${socket.id}`);

    socket.on('join', room => {
        if (!rooms[room]) rooms[room] = {};
        rooms[room][socket.id] = { ready: false, joined: Date.now() };
        socket.join(room);
        socket.room = room;
        const count = Object.keys(rooms[room]).length;
        console.log(`[加入] 房间:${room} 人数:${count}`);
        socket.emit('joined', count);
    });

    socket.on('camera-ready', room => {
        if (!rooms[room] || !rooms[room][socket.id]) return;
        rooms[room][socket.id].ready = true;
        console.log(`[摄像头就绪] ${socket.id} 房间:${room}`);
        
        const users = Object.keys(rooms[room]);
        const readyUsers = users.filter(id => rooms[room][id].ready);
        
        if (readyUsers.length >= 2) {
            // 找出先加入的用户作为发起方
            const first = users.reduce((a, b) => 
                rooms[room][a].joined < rooms[room][b].joined ? a : b
            );
            console.log(`[开始通话] 发起方:${first}`);
            io.to(first).emit('start-call');
        }
    });

    socket.on('offer', data => socket.to(data.room).emit('offer', data));
    socket.on('answer', data => socket.to(data.room).emit('answer', data));
    socket.on('candidate', data => socket.to(data.room).emit('candidate', data));

    socket.on('leave', room => {
        socket.to(room).emit('peer-disconnected');
    });

    socket.on('disconnect', () => {
        console.log(`[断开] ${socket.id}`);
        if (socket.room && rooms[socket.room]) {
            delete rooms[socket.room][socket.id];
            if (Object.keys(rooms[socket.room]).length === 0) {
                delete rooms[socket.room];
            } else {
                io.to(socket.room).emit('peer-disconnected');
            }
        }
    });
});

server.listen(3000, '0.0.0.0', () => {
    console.log('=== 服务器启动 ===');
    console.log('手机访问: https://10.0.12.35:3000');
});
