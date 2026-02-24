import io from 'socket.io-client';

const socket = io('http://13.62.133.82:4000');
//const socket = io('http://localhost:4000');

export default socket;