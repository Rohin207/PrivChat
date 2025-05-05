import React, { 
  createContext, 
  useState, 
  useEffect, 
  useContext,
  useCallback 
} from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { useToast } from "@/hooks/use-toast";
import { generateRandomId } from '@/utils/crypto';

// Define message type
export type Message = {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  roomId: string;
  isSystemMessage?: boolean;
  isEncrypted: boolean;
};

// Define join request type
export type JoinRequest = {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  timestamp: number;
};

// Define private chat type
export type PrivateChat = {
  id: string;
  participants: [string, string];
  messages: Message[];
};

// Define the structure of the room object
export type Room = {
  id: string;
  name: string;
  password?: string;
  admin: string;
  participants: { id: string; name: string; isAdmin: boolean }[];
  messages: Message[];
  createdAt: number;
  isPrivate: boolean;
  joinRequests: JoinRequest[];
  encryptionKey?: string;
};

// Define the context type
type RoomContextType = {
  socket: Socket | null;
  currentRoom: Room | null;
  setCurrentRoom: React.Dispatch<React.SetStateAction<Room | null>> | null;
  rooms: Room[];
  setRooms: React.Dispatch<React.SetStateAction<Room[]>>;
  createRoom: (roomName: string, password?: string, isPrivate?: boolean) => Promise<void>;
  joinRoom: (roomId: string, password?: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;
  sendMessage: (content: string, isSystemMessage?: boolean) => void;
  sendPrivateMessage: (recipientId: string, content: string) => void;
  privateChats: PrivateChat[];
  activePrivateChat: string | null;
  setActivePrivateChat: React.Dispatch<React.SetStateAction<string | null>>;
  fetchJoinRequests: () => Promise<void>;
  approveJoinRequest: (request: JoinRequest) => Promise<boolean>;
  rejectJoinRequest: (request: JoinRequest) => Promise<void>;
  requestToJoin: (roomId: string) => Promise<boolean>;
};

// Create the context with a default value of null
const RoomContext = createContext<RoomContextType | null>(null);

// RoomProvider component
export const RoomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [privateChats, setPrivateChats] = useState<PrivateChat[]>([]);
  const [activePrivateChat, setActivePrivateChat] = useState<string | null>(null);
  const { user } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_SERVER_URL, {
      autoConnect: false,
      transports: ['websocket']
    });

    setSocket(newSocket);

    // Clean up on unmount
    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Connect socket when user is available
  useEffect(() => {
    if (user && socket && !socket.connected) {
      socket.auth = { userId: user.id, userName: user.name };
      socket.connect();
    }
  }, [user, socket]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('connect_error', (err) => {
      console.error("Connection error:", err);
      toast({
        title: "Connection Error",
        description: `Failed to connect to server: ${err.message}`,
        variant: "destructive",
      });
    });

    socket.on('rooms', (serverRooms: Room[]) => {
      setRooms(serverRooms);
    });

    socket.on('room_updated', (updatedRoom: Room) => {
      setRooms(prevRooms => {
        const roomIndex = prevRooms.findIndex(room => room.id === updatedRoom.id);
        if (roomIndex !== -1) {
          const newRooms = [...prevRooms];
          newRooms[roomIndex] = updatedRoom;
          return newRooms;
        } else {
          return [...prevRooms, updatedRoom];
        }
      });

      if (currentRoom && currentRoom.id === updatedRoom.id) {
        setCurrentRoom(updatedRoom);
      }
    });

    socket.on('new_message', (message: Message) => {
      setCurrentRoom(prevRoom => {
        if (!prevRoom || message.roomId !== prevRoom.id) return prevRoom;

        return {
          ...prevRoom,
          messages: [...prevRoom.messages, message],
        };
      });
    });

    socket.on('private_message', (chat: PrivateChat) => {
      setPrivateChats(prevChats => {
        const chatIndex = prevChats.findIndex(c => c.id === chat.id);
        if (chatIndex !== -1) {
          const newChats = [...prevChats];
          newChats[chatIndex] = chat;
          return newChats;
        } else {
          return [...prevChats, chat];
        }
      });
    });

    socket.on('room_deleted', (roomId: string) => {
      setRooms(prevRooms => prevRooms.filter(room => room.id !== roomId));
      if (currentRoom?.id === roomId) {
        setCurrentRoom(null);
        navigate('/');
      }
    });

    socket.on('join_request_list', (requests: JoinRequest[]) => {
      setCurrentRoom(prevRoom => {
        if (!prevRoom) return prevRoom;
        return { ...prevRoom, joinRequests: requests };
      });
    });

    // Clean up listeners on disconnect
    return () => {
      socket.off('connect_error');
      socket.off('rooms');
      socket.off('room_updated');
      socket.off('new_message');
      socket.off('private_message');
      socket.off('room_deleted');
      socket.off('join_request_list');
    };
  }, [socket, setCurrentRoom, navigate, currentRoom, toast]);

  // Create a new room
  const createRoom = async (roomName: string, password?: string, isPrivate: boolean = false): Promise<void> => {
    if (!socket || !user) return;

    const roomId = generateRandomId();
    socket.emit('create_room', {
      name: roomName,
      password: password,
      roomId: roomId,
      isPrivate: isPrivate,
    }, (response: { success: boolean, error?: string }) => {
      if (response.success) {
        toast({
          title: "Room Created",
          description: `Room "${roomName}" created successfully.`,
        });
        navigate(`/room/${roomId}`);
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to create room.",
          variant: "destructive",
        });
      }
    });
  };

  // Join an existing room
  const joinRoom = async (roomId: string, password?: string): Promise<boolean> => {
    if (!socket || !user) return false;

    return new Promise((resolve) => {
      socket.emit('join_room', { roomId: roomId, password: password }, (response: { success: boolean, error?: string, room?: Room }) => {
        if (response.success) {
          setCurrentRoom(response.room || null);
          setPrivateChats([]);
          toast({
            title: "Joined Room",
            description: `You have joined room "${response.room?.name || roomId}".`,
          });
          navigate(`/room/${roomId}`);
          resolve(true);
        } else {
          toast({
            title: "Error",
            description: response.error || "Failed to join room.",
            variant: "destructive",
          });
          resolve(false);
        }
      });
    });
  };

  // Leave the current room
  const leaveRoom = async (): Promise<void> => {
    if (!socket || !currentRoom || !user) return;

    return new Promise((resolve) => {
      socket.emit('leave_room', { roomId: currentRoom.id }, (response: { success: boolean, error?: string }) => {
        if (response.success) {
          setCurrentRoom(null);
          setPrivateChats([]);
          toast({
            title: "Left Room",
            description: `You have left room "${currentRoom.name}".`,
          });
          navigate('/');
          resolve();
        } else {
          toast({
            title: "Error",
            description: response.error || "Failed to leave room.",
            variant: "destructive",
          });
          resolve();
        }
      });
    });
  };

  // Delete a room
  const deleteRoom = async (roomId: string): Promise<void> => {
    if (!socket) return;

    socket.emit('delete_room', { roomId: roomId }, (response: { success: boolean, error?: string }) => {
      if (response.success) {
        setRooms(prevRooms => prevRooms.filter(room => room.id !== roomId));
        if (currentRoom?.id === roomId) {
          setCurrentRoom(null);
          navigate('/');
        }
        toast({
          title: "Room Deleted",
          description: `Room "${roomId}" has been deleted.`,
        });
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to delete room.",
          variant: "destructive",
        });
      }
    });
  };

  // Send a message to the current room
  const sendMessage = (content: string, isSystemMessage: boolean = false): void => {
    if (!socket || !currentRoom || !user) return;

    const messageId = generateRandomId();
    socket.emit('send_message', {
      roomId: currentRoom.id,
      content: content,
      messageId: messageId,
      isSystemMessage: isSystemMessage,
      isEncrypted: !!currentRoom.encryptionKey,
    });
  };

  // Send a private message to a user
  const sendPrivateMessage = (recipientId: string, content: string): void => {
    if (!socket || !user) return;

    socket.emit('send_private_message', {
      recipientId: recipientId,
      content: content,
    });
  };

  // Fetch join requests for the current room
  const fetchJoinRequests = async (): Promise<void> => {
    if (!socket || !currentRoom || !user?.isAdmin) return;

    socket.emit('fetch_join_requests', { roomId: currentRoom.id });
  };

  // Approve a join request
  const approveJoinRequest = async (request: JoinRequest): Promise<boolean> => {
    if (!socket || !currentRoom || !user?.isAdmin) return false;

    return new Promise((resolve) => {
      socket.emit('approve_join_request', { roomId: currentRoom.id, requestId: request.id }, (response: { success: boolean, error?: string }) => {
        if (response.success) {
          setCurrentRoom(prevRoom => {
            if (!prevRoom) return prevRoom;
            const updatedRequests = prevRoom.joinRequests.filter(req => req.id !== request.id);
            return { ...prevRoom, joinRequests: updatedRequests };
          });
          toast({
            title: "Request Approved",
            description: `User "${request.userName}" has been approved to join the room.`,
          });
          resolve(true);
        } else {
          toast({
            title: "Error",
            description: response.error || "Failed to approve join request.",
            variant: "destructive",
          });
          resolve(false);
        }
      });
    });
  };

  // Reject a join request
  const rejectJoinRequest = async (request: JoinRequest): Promise<void> => {
    if (!socket || !currentRoom || !user?.isAdmin) return;

    socket.emit('reject_join_request', { roomId: currentRoom.id, requestId: request.id }, (response: { success: boolean, error?: string }) => {
      if (response.success) {
        setCurrentRoom(prevRoom => {
          if (!prevRoom) return prevRoom;
          const updatedRequests = prevRoom.joinRequests.filter(req => req.id !== request.id);
          return { ...prevRoom, joinRequests: updatedRequests };
        });
        toast({
          title: "Request Rejected",
          description: `User "${request.userName}" join request has been rejected.`,
        });
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to reject join request.",
          variant: "destructive",
        });
      }
    });
  };

  // Request to join a private room
  const requestToJoin = async (roomId: string): Promise<boolean> => {
    if (!socket || !user) return false;

    return new Promise((resolve) => {
      socket.emit('request_to_join', { roomId: roomId }, (response: { success: boolean, error?: string }) => {
        if (response.success) {
          toast({
            title: "Request Sent",
            description: "Your request to join the room has been sent to the admin.",
          });
          resolve(true);
        } else {
          toast({
            title: "Error",
            description: response.error || "Failed to send join request.",
            variant: "destructive",
          });
          resolve(false);
        }
      });
    });
  };

  // Provide the context value
  const value: RoomContextType = {
    socket,
    currentRoom,
    setCurrentRoom,
    rooms,
    setRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    deleteRoom,
    sendMessage,
    sendPrivateMessage,
    privateChats,
    activePrivateChat,
    setActivePrivateChat,
    fetchJoinRequests,
    approveJoinRequest,
    rejectJoinRequest,
    requestToJoin,
  };

  return (
    <RoomContext.Provider value={value}>
      {children}
    </RoomContext.Provider>
  );
};

// Custom hook to use the RoomContext
export const useRoom = (): RoomContextType => {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
};
