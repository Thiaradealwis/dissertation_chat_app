//code from https://www.djamware.com/post/68a6a3707c93f30ea29f62ac/build-a-realtime-chat-app-with-react-nodejs-and-socketio#create-project
require("dotenv").config();

console.log(
    "OPENAI_API_KEY loaded:",
    process.env.OPENAI_API_KEY
        ? process.env.OPENAI_API_KEY.slice(0, 7) + "..."
        : " NOT FOUND"
);

// server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const OpenAI = require("openai")

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
let chatHistory = [];
let messagesSinceLastIntervention = 0;
const AI_RESPONSE_THRESHOLD = 3;


async function streamAIResponse() {
    const systemMessage = {
        role: "system",
        content: "Role:\n" +
            "You are an AI mediator supporting a small group discussion.\n\n" +
            "Goal:\n" +
            "Facilitate the conversation so everyone’s ideas are considered. Focus on Equal Participation, Evaluation of Information brought up, Evidence Based opinions, exploratory discussion adn sharing of information. Do not recommend decisions or provide your own opinions.\n\n" +
            "Style:\n" +
            "- Keep responses very short (1–2 sentences max).\n" +
            "- Use casual, friendly, conversational language.\n" +
            "- Ask clarifying questions instead of giving long instructions.\n" +
            "- Avoid bullet points or long structured text.\n" +
            "- Intervene only when necessary.\n" +
            "- If there’s nothing important to add, respond with an empty string."


    };

    const messages = [
        systemMessage,
        ...chatHistory.map(msg => ({
            role: msg.sender === "AI Agent" ? "assistant" : "user",
            content: msg.content
        }))
    ];

    const response = await client.responses.stream({
        model: "gpt-5-mini",
        input: messages,

    });

    let fullText = "";

    io.emit("ai-start");

    for await (const event of response) {
        if (event.type === "response.output_text.delta") {
            fullText += event.delta;

            io.emit("ai-update", fullText);
        }
    }

    io.emit("ai-end");

    return fullText;
}
io.on("connection", socket => {
    console.log(`User eal20: ${socket.id}`);

    socket.on("chat message", async data => {
        console.log("Message received:", data);

        chatHistory.push({ sender: data.sender, content: data.content })


        if (data.sender !== "AI Agent") {
            messagesSinceLastIntervention++;
            io.emit("chat message", data);

            if (messagesSinceLastIntervention >= AI_RESPONSE_THRESHOLD) {
                try {

                    const aiContent = await streamAIResponse(chatHistory, io);

                    if (!aiContent) return;

                    const aiMessage = { sender: "AI Agent", content: aiContent };

                    chatHistory.push(aiMessage);
                    messagesSinceLastIntervention = 0;
                } catch (err) {
                    console.error("Error generating AI response:", err);
                }
            }

        }
    });

    socket.on("disconnect", () => {
        console.log("User disconnected", socket.id);
    });
});

server.listen(4000, () => {
    console.log("Server running on http://localhost:4000");
});