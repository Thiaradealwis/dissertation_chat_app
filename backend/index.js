//initial code from https://www.djamware.com/post/68a6a3707c93f30ea29f62ac/build-a-realtime-chat-app-with-react-nodejs-and-socketio#create-project
require("dotenv").config();
const { v4: uuidv4 } = require("uuid");

// server/index.js
const express = require("express");
const http = require("http");
const { createServer } = require('http');
const { Server } = require("socket.io");
const cors = require("cors");
const OpenAI = require("openai")

const app = express();
const server = createServer(app);
app.use(cors({
    origin: 'http://diss-chat-frontend.s3-website.eu-north-1.amazonaws.com', // allow S3 frontend
    //origin: "http://localhost:5173",
    methods: ['GET','POST'],
    credentials: true
}));

const io = new Server(server, {
    cors: {
        origin: "http://diss-chat-frontend.s3-website.eu-north-1.amazonaws.com",
        //origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const AI_RESPONSE_THRESHOLD = 3;

const sessions = {};
const colours = [
    "Red", "Blue", "Green", "Yellow"
];

app.get("/transcript/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    const session = sessions[sessionId];

    if (!session) {
        return res.status(404).send("Session not found");
    }

    let transcript = `Session ID: ${sessionId}\n\nParticipants:\n`;

    Object.values(session.participants).forEach(name => {
        transcript += `- ${name}\n`;
    });

    transcript += "\n--- Transcript ---\n\n";

    session.messages.forEach(msg => {
        transcript += `[${msg.timestamp}] ${msg.sender}: ${msg.content}\n`;
    });

    res.setHeader("Content-disposition", `attachment; filename=transcript-${sessionId}.txt`);
    res.setHeader("Content-Type", "text/plain");
    res.send(transcript);
});


async function streamAIResponse(sessionMessages, io, sessionId) {
    const systemMessage = {
        role: "system",
        content: "Role:\n" +
            "You are an AI mediator supporting a small group discussion.\n\n" +
            "Goal:\n" +
            "Facilitate the conversation so everyone’s ideas are considered. Focus on Equal Participation, Evaluation of Information brought up, Evidence Based opinions, exploratory discussion adn sharing of information. Do not recommend decisions or provide your own opinions.\n\n" +
            "Style:\n" +
            "- Please refer to other members of the conversation using their sender ID" +
            "- Participants may address you directly using @mediator" +
            "- Keep responses very short (1–2 sentences max).\n" +
            "- Use casual, friendly, conversational language.\n" +
            "- Ask clarifying questions instead of giving long instructions.\n" +
            "- Avoid bullet points or long structured text.\n" +
            "- Intervene only when necessary.\n" +
            "- If there’s nothing important to add, respond with an empty string."


    };

    const messages = [
        systemMessage,
        ...sessionMessages.map(msg => ({
            role: msg.sender === "AI Agent" ? "assistant" : "user",
            content: `${msg.sender}: ${msg.content}`
        }))
    ];

    const response = await client.responses.stream({
        model: "gpt-5-mini",
        input: messages,

    });

    let fullText = "";

    io.to(sessionId).emit("ai-start");

    for await (const event of response) {
        if (event.type === "response.output_text.delta") {
            fullText += event.delta;

            io.to(sessionId).emit("ai-update", fullText);
        }
    }

    io.to(sessionId).emit("ai-end");

    return fullText;
}


io.on("connection", socket => {
    console.log(`User eal20: ${socket.id}`);

    socket.on("join session", ({sessionId}) => {
        if (!sessionId) {
            sessionId = uuidv4();
        }

        if (!sessions[sessionId]) {
            sessions[sessionId] = {
                participants: {},
                messages: [],
                messagesSinceLastIntervention: 0
            };
        }

        const session = sessions[sessionId];
        const assignedId = colours[Object.keys(session.participants).length % colours.length];

        session.participants[socket.id] = assignedId

        socket.join(sessionId);

        socket.emit("session joined", {
            sessionId, username: assignedId
        });

        if (session.messages.length > 0) {
            socket.emit("chat history", session.messages);
        }
    });

    socket.on("chat message", async ({sessionId, content}) => {
        console.log("Message received:", content);

        const session = sessions[sessionId];
        if (!session) return;

        const sender = session.participants[socket.id];

        const now = new Date();
        const time =
            now.getHours().toString().padStart(2, "0") + ":" +
            now.getMinutes().toString().padStart(2, "0");

        const message = {sender, content, timestamp: time};

        // Store message
        session.messages.push(message);


        if (message.sender !== "AI Agent") {
            session.messagesSinceLastIntervention++;
            io.to(sessionId).emit("chat message", message);

            if (session.messagesSinceLastIntervention >= AI_RESPONSE_THRESHOLD) {
                try {

                    const aiContent = await streamAIResponse(session.messages, io, sessionId);

                    if (!aiContent) return;

                    const aiMessage = {
                        sender: "AI Agent",
                        content: aiContent,
                        timestamp: new Date().toLocaleTimeString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit"
                        })
                    };

                    session.messages.push(aiMessage);

                    session.messagesSinceLastIntervention = 0;
                } catch (err) {
                    console.error("Error generating AI response:", err);
                }
            }
            if (content.includes("@mediator")) {
                session.messages.push({ sender, content: content });

                await streamAIResponse(session.messages, io, sessionId);
            }

        }
    });

    socket.on("disconnect", () => {
        console.log("User disconnected", socket.id);
    });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0',() => {
    console.log(`Server running on port ${PORT}`);
});