import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";

let io: SocketIOServer;

/**
 * Initialize Socket.io
 * @param server HTTP Server instance
 * @returns Socket.io Server instance
 */
export const initSocket = (server: HTTPServer) => {
    io = new SocketIOServer(server, {
        cors: {
            origin: "*", // In production, this should be restricted to the frontend URL
            methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
            credentials: true
        },
    });

    io.on("connection", (socket: Socket) => {
        console.log("🔌 New client connected:", socket.id);

        // Join a private room for the user to received targeted notifications
        socket.on("join", (userId: string) => {
            if (userId) {
                socket.join(userId);
                console.log(`👤 User ${userId} joined their private notification room`);
            }
        });

        socket.on("disconnect", () => {
            console.log("🔌 Client disconnected:", socket.id);
        });
    });

    return io;
};

/**
 * Get the Socket.io instance
 * @returns Socket.io Server instance
 */
export const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};

/**
 * Send a notification to a specific user
 * @param userId User ID to send notification to
 * @param data Notification data
 */
export const sendNotification = (userId: string, data: any) => {
    if (io) {
        io.to(userId).emit("notification", data);
    }
};
