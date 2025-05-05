import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from './UserContext';
import { generateRandomId, saveRoomEncryptionKey, getRoomEncryptionKey, promptForEncryptionKey, encryptMessageCompat, decryptMessageCompat } from '../utils/crypto';
import { supabase } from '../integrations/supabase/client';
import { useToast } from '../hooks/use-toast';

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  isEncrypted: boolean;
  isSystemMessage?: boolean;
}

export interface JoinRequest {
  id: string;
  userId: string;
  userName: string;
  roomId: string;
  timestamp: Date;
}

export interface Room {
  id: string;
  password: string;
  name: string;
  createdAt: Date;
  admin: string; // User ID of the admin
  participants: User[];
  messages: Message[];
  encryptionKey?: string;
  joinRequests?: JoinRequest[];
  pendingApproval?: boolean; // Flag to indicate if the user is pending approval
}

interface PrivateChat {
  id: string;
  participants: [string, string]; // User IDs
  messages: Message[];
}

interface RoomContextType {
  currentRoom: Room | null;
  setCurrentRoom: (room: Room | null) => void;
  privateChats: PrivateChat[];
  setPrivateChats: (chats: PrivateChat[]) => void;
  activePrivateChat: string | null;
  setActivePrivateChat: (chatId: string | null) => void;
  createRoom: (name: string, adminId: string, adminName: string) => Promise<Room>;
  joinRoom: (roomId: string, password: string, user: User) => Promise<boolean>;
  requestToJoinRoom: (roomId: string, password: string, user: User) => Promise<boolean>;
  approveJoinRequest: (request: JoinRequest) => Promise<boolean>;
  rejectJoinRequest: (request: JoinRequest) => Promise<void>;
  leaveRoom: () => Promise<void>;
  sendMessage: (content: string, isSystem?: boolean) => void;
  sendPrivateMessage: (receiverId: string, content: string) => void;
  availableRooms: { id: string; name: string }[];
  fetchJoinRequests: () => Promise<void>;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export const useRoom = () => {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
};

interface RoomProviderProps {
  children: ReactNode;
}

export const RoomProvider = ({ children }: RoomProviderProps) => {
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [privateChats, setPrivateChats] = useState<PrivateChat[]>([]);
  const [activePrivateChat, setActivePrivateChat] = useState<string | null>(null);
  const [availableRooms, setAvailableRooms] = useState<{ id: string; name: string }[]>([]);
  const { toast } = useToast();

  // Subscribe to room updates
  useEffect(() => {
    const roomSubscription = supabase
      .channel('public:rooms')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rooms'
      }, (payload) => {
        console.log('Room change detected:', payload);
        fetchAvailableRooms();
      })
      .subscribe();

    // Initial load of available rooms
    fetchAvailableRooms();

    return () => {
      supabase.removeChannel(roomSubscription);
    };
  }, []);

  // Subscribe to messages when a room is joined
  useEffect(() => {
    if (!currentRoom) return;

    const messageSubscription = supabase
      .channel(`room-messages-${currentRoom.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${currentRoom.id}`
      }, (payload) => {
        console.log('New message received:', payload);
        
        if (payload.new) {
          const newMessage: any = payload.new;
          
          // Skip if this is our own message (we've already added it to the UI)
          const userId = sessionStorage.getItem('userId');
          if (newMessage.sender_id === userId) return;
          
          // Convert from database format to our app format
          const message: Message = {
            id: newMessage.id,
            senderId: newMessage.sender_id,
            senderName: newMessage.sender_name,
            content: newMessage.content,
            timestamp: new Date(newMessage.created_at),
            isEncrypted: newMessage.is_encrypted,
            isSystemMessage: newMessage.is_system_message
          };
          
          // Add the message to the current room
          setCurrentRoom(prevRoom => {
            if (!prevRoom) return null;
            return {
              ...prevRoom,
              messages: [...prevRoom.messages, message]
            };
          });
        }
      })
      .subscribe();

    // Subscribe to participants
    const participantSubscription = supabase
      .channel(`room-participants-${currentRoom.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'participants',
        filter: `room_id=eq.${currentRoom.id}`
      }, (payload) => {
        console.log('Participant change detected:', payload);
        
        // Refresh participant list
        if (currentRoom) {
          fetchRoomParticipants(currentRoom.id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messageSubscription);
      supabase.removeChannel(participantSubscription);
    };
  }, [currentRoom?.id]);

  // Subscribe to join requests if user is admin
  useEffect(() => {
    if (!currentRoom) return;
    if (currentRoom.admin !== sessionStorage.getItem('userId')) return;
    
    // Only admin should subscribe to join requests
    const joinRequestSubscription = supabase
      .channel(`join-requests-${currentRoom.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'join_requests',
        filter: `room_id=eq.${currentRoom.id}`
      }, (payload) => {
        console.log('Join request change detected:', payload);
        fetchJoinRequests();
      })
      .subscribe();
    
    // Initial fetch of join requests
    fetchJoinRequests();
    
    return () => {
      supabase.removeChannel(joinRequestSubscription);
    };
  }, [currentRoom?.id, currentRoom?.admin]);

  // Fetch join requests for current room
  const fetchJoinRequests = async () => {
    if (!currentRoom) return;
    
    // Only admin should fetch join requests
    if (currentRoom.admin !== sessionStorage.getItem('userId')) return;

    try {
      const { data, error } = await supabase
        .from('join_requests')
        .select('*')
        .eq('room_id', currentRoom.id);

      if (error) {
        console.error('Error fetching join requests:', error);
        return;
      }

      if (data) {
        const joinRequests: JoinRequest[] = data.map(req => ({
          id: req.id,
          userId: req.user_id,
          userName: req.user_name,
          roomId: req.room_id,
          timestamp: new Date(req.created_at)
        }));

        setCurrentRoom(prev => {
          if (!prev) return null;
          return { ...prev, joinRequests };
        });
      }
    } catch (error) {
      console.error("Error in fetchJoinRequests:", error);
    }
  };

  // Fetch available rooms
  const fetchAvailableRooms = async () => {
    try {
      // Fetch all rooms first
      const { data: allRooms, error } = await supabase
        .from('rooms')
        .select('id, name')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching available rooms:', error);
        return;
      }

      // Initialize an array for active rooms
      const activeRooms = [];
      
      // Check each room for participants
      for (const room of allRooms || []) {
        const { data: participantsData, error: participantsError } = await supabase
          .from('participants')
          .select('count')
          .eq('room_id', room.id);
          
        // Check if this room has participants
        const hasParticipants = participantsData && participantsData.length > 0;
        
        if (hasParticipants) {
          // Room has participants, keep it
          activeRooms.push(room);
        } else {
          console.log("Found empty room, deleting:", room.id);
          
          // Clean up the empty room
          await cleanupRoom(room.id);
        }
      }
      
      setAvailableRooms(activeRooms);
    } catch (error) {
      console.error("Error in fetchAvailableRooms:", error);
    }
  };
  
  // Helper function to clean up a room and its related data
  const cleanupRoom = async (roomId: string) => {
    try {
      console.log("Cleaning up room:", roomId);
      
      // Delete all messages for this room
      const { error: messagesError } = await supabase
        .from('messages')
        .delete()
        .eq('room_id', roomId);
      
      if (messagesError) {
        console.error("Error deleting messages:", messagesError);
      }
      
      // Delete all join requests for this room
      const { error: joinRequestsError } = await supabase
        .from('join_requests')
        .delete()
        .eq('room_id', roomId);
      
      if (joinRequestsError) {
        console.error("Error deleting join requests:", joinRequestsError);
      }
      
      // Delete all participants for this room
      const { error: participantsError } = await supabase
        .from('participants')
        .delete()
        .eq('room_id', roomId);
      
      if (participantsError) {
        console.error("Error deleting participants:", participantsError);
      }
      
      // Finally delete the room itself
      const { error: roomError } = await supabase
        .from('rooms')
        .delete()
        .eq('id', roomId);
      
      if (roomError) {
        console.error("Error deleting room:", roomError);
      }
      
      console.log("Room cleanup complete:", roomId);
    } catch (error) {
      console.error("Error in cleanupRoom:", error);
    }
  };

  // Fetch room participants
  const fetchRoomParticipants = async (roomId: string) => {
    try {
      const { data, error } = await supabase
        .from('participants')
        .select('*')
        .eq('room_id', roomId);

      if (error) {
        console.error('Error fetching room participants:', error);
        return;
      }

      if (!currentRoom) return;

      // Update the participants list
      const participants: User[] = data.map(p => ({
        id: p.user_id,
        name: p.user_name,
        isAdmin: p.is_admin,
        joinedAt: new Date(p.joined_at)
      }));

      setCurrentRoom(prev => {
        if (!prev) return null;
        return { ...prev, participants };
      });
    } catch (error) {
      console.error("Error in fetchRoomParticipants:", error);
    }
  };

  // Check if user has a pending join request
  const checkPendingJoinRequest = async (roomId: string, userId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('join_requests')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .single();
      
      if (error) {
        console.log("No pending join request found");
        return false;
      }
      
      return data !== null;
    } catch (error) {
      console.error("Error checking pending join request:", error);
      return false;
    }
  };

  // Create a new room
  const createRoom = async (name: string, adminId: string, adminName: string): Promise<Room> => {
    const roomId = generateRandomId(16);
    const roomPassword = generateRandomId(8); 
    const encryptionKey = generateRandomId(32);
    
    try {
      // Insert the room into Supabase
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .insert({
          id: roomId,
          name: name || `Room-${roomId.slice(0, 6)}`,
          password: roomPassword,
          admin_id: adminId,
        })
        .select()
        .single();
      
      if (roomError) {
        console.error('Error creating room:', roomError);
        toast({
          title: 'Error',
          description: 'Failed to create room. Please try again.',
          variant: 'destructive'
        });
        throw roomError;
      }
      
      // Add the admin as a participant
      const { error: participantError } = await supabase
        .from('participants')
        .insert({
          room_id: roomId,
          user_id: adminId,
          user_name: adminName,
          is_admin: true
        });
      
      if (participantError) {
        console.error('Error adding participant:', participantError);
        toast({
          title: 'Error',
          description: 'Failed to join as admin. Please try again.',
          variant: 'destructive'
        });
        throw participantError;
      }
      
      console.log("Room created:", roomId, "with password:", roomPassword);
      
      // Save encryption key to session storage
      saveRoomEncryptionKey(roomId, encryptionKey);
      
      // Create room object for the UI
      const newRoom: Room = {
        id: roomId,
        password: roomPassword,
        name: name || `Room-${roomId.slice(0, 6)}`,
        createdAt: new Date(roomData.created_at),
        admin: adminId,
        participants: [{
          id: adminId,
          name: adminName,
          isAdmin: true,
          joinedAt: new Date()
        }],
        messages: [],
        encryptionKey,
        joinRequests: []
      };
      
      setCurrentRoom(newRoom);
      await fetchAvailableRooms(); // Refresh the list of available rooms
      
      return newRoom;
    } catch (error) {
      console.error("Error in createRoom:", error);
      throw error;
    }
  };

  // Request to join an existing room
  const requestToJoinRoom = async (roomId: string, password: string, user: User): Promise<boolean> => {
    try {
      // Check if room exists and password is correct
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .eq('password', password)
        .single();
      
      if (roomError || !roomData) {
        console.log("Room not found or incorrect password");
        toast({
          title: "Error",
          description: "Invalid room ID or password",
          variant: "destructive"
        });
        return false;
      }
      
      // Check if user is already a participant
      const { data: existingParticipant } = await supabase
        .from('participants')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .maybeSingle();
        
      if (existingParticipant) {
        toast({
          title: 'Already a participant',
          description: 'You are already in this room.',
        });
        
        // If user is already a participant, fetch the room data
        await joinRoom(roomId, password, user);
        return true;
      }
      
      // Check for existing join request
      const { data: existingRequest } = await supabase
        .from('join_requests')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .maybeSingle();
        
      if (existingRequest) {
        toast({
          title: 'Request pending',
          description: 'Your join request is already pending approval.',
        });
        
        // Set current room with pending approval flag
        const newRoom: Room = {
          id: roomId,
          password: password,
          name: roomData.name,
          createdAt: new Date(roomData.created_at),
          admin: roomData.admin_id,
          participants: [],
          messages: [],
          pendingApproval: true
        };
        
        setCurrentRoom(newRoom);
        return true;
      }
      
      // Add join request
      const { error: requestError } = await supabase
        .from('join_requests')
        .insert({
          room_id: roomId,
          user_id: user.id,
          user_name: user.name
        });
      
      if (requestError) {
        console.error('Error adding join request:', requestError);
        toast({
          title: 'Error',
          description: 'Failed to send join request. Please try again.',
          variant: 'destructive'
        });
        return false;
      }
      
      toast({
        title: 'Join request sent',
        description: 'Waiting for admin approval to join the room.',
      });
      
      // Set current room with pending approval flag
      const newRoom: Room = {
        id: roomId,
        password: password,
        name: roomData.name,
        createdAt: new Date(roomData.created_at),
        admin: roomData.admin_id,
        participants: [],
        messages: [],
        pendingApproval: true
      };
      
      setCurrentRoom(newRoom);
      return true;
    } catch (error) {
      console.error("Error in requestToJoinRoom:", error);
      return false;
    }
  };

  // Approve a join request
  const approveJoinRequest = async (request: JoinRequest): Promise<boolean> => {
    try {
      if (!currentRoom || currentRoom.admin !== sessionStorage.getItem('userId')) {
        toast({
          title: 'Error',
          description: 'Only the admin can approve join requests',
          variant: 'destructive'
        });
        return false;
      }
      
      // Add user to room participants
      const { error: participantError } = await supabase
        .from('participants')
        .insert({
          room_id: request.roomId,
          user_id: request.userId,
          user_name: request.userName
        });
      
      if (participantError) {
        console.error('Error adding participant:', participantError);
        toast({
          title: 'Error',
          description: 'Failed to approve request. Please try again.',
          variant: 'destructive'
        });
        return false;
      }
      
      // Add system message
      await supabase
        .from('messages')
        .insert({
          room_id: request.roomId,
          sender_id: 'system',
          sender_name: 'System',
          content: `${request.userName} joined the room`,
          is_encrypted: false,
          is_system_message: true
        });
      
      // Delete the join request
      await supabase
        .from('join_requests')
        .delete()
        .eq('id', request.id);
      
      // Refresh join requests
      await fetchJoinRequests();
      
      toast({
        title: 'Request Approved',
        description: `${request.userName} has been added to the room`,
      });
      
      return true;
    } catch (error) {
      console.error("Error in approveJoinRequest:", error);
      return false;
    }
  };

  // Reject a join request
  const rejectJoinRequest = async (request: JoinRequest) => {
    try {
      if (!currentRoom || currentRoom.admin !== sessionStorage.getItem('userId')) return;
      
      // Delete the join request
      await supabase
        .from('join_requests')
        .delete()
        .eq('id', request.id);
      
      // Refresh join requests
      await fetchJoinRequests();
      
      toast({
        title: 'Request Rejected',
        description: `Join request from ${request.userName} has been rejected`,
      });
    } catch (error) {
      console.error("Error in rejectJoinRequest:", error);
    }
  };

  // Join an existing room directly (for backward compatibility)
  const joinRoom = async (roomId: string, password: string, user: User): Promise<boolean> => {
    try {
      console.log("Attempting to join room:", roomId);
      
      // Check if room exists and password is correct
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .eq('password', password)
        .single();
      
      if (roomError || !roomData) {
        console.log("Room not found or incorrect password:", roomError);
        toast({
          title: "Error",
          description: "Invalid room ID or password",
          variant: "destructive"
        });
        return false;
      }
      
      console.log("Room found:", roomData);
      
      // Check if admin or if approval is required
      if (roomData.admin_id !== user.id) {
        // Check if user is already a participant
        const { data: existingParticipant, error: participantError } = await supabase
          .from('participants')
          .select('*')
          .eq('room_id', roomId)
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (participantError) {
          console.log("Error checking participant:", participantError);
        }
        
        // If not admin and not already a participant, request to join
        if (!existingParticipant) {
          // Check if there's a pending join request
          const hasPendingRequest = await checkPendingJoinRequest(roomId, user.id);
          
          if (hasPendingRequest) {
            toast({
              title: 'Request pending',
              description: 'Your join request is awaiting admin approval.',
            });
            
            // Set current room with pending approval flag
            const newRoom: Room = {
              id: roomId,
              password: password,
              name: roomData.name,
              createdAt: new Date(roomData.created_at),
              admin: roomData.admin_id,
              participants: [],
              messages: [],
              pendingApproval: true
            };
            
            setCurrentRoom(newRoom);
            return true;
          }
          
          // Request to join instead
          return await requestToJoinRoom(roomId, password, user);
        }
      }
      
      // User is admin or already a participant
      try {
        // Check if already a participant
        const { data: existingParticipant, error: participantError } = await supabase
          .from('participants')
          .select('*')
          .eq('room_id', roomId)
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (participantError && participantError.code !== 'PGRST116') {
          console.error("Error checking participant:", participantError);
        }
        
        // Fetch all messages for this room
        const { data: messagesData } = await supabase
          .from('messages')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true });
        
        // Fetch all participants
        const { data: participantsData } = await supabase
          .from('participants')
          .select('*')
          .eq('room_id', roomId);
        
        // Get stored encryption key from session
        let encryptionKey = getRoomEncryptionKey(roomId);

        // If the user is admin (roomCreator) and doesn't have an encryption key yet, 
        // always generate a new key and save it
        if (!encryptionKey && roomData.admin_id === user.id) {
          encryptionKey = generateRandomId(32);
          saveRoomEncryptionKey(roomId, encryptionKey);
          
          // Alert admin about the encryption key
          toast({
            title: "Encryption Key Generated",
            description: "Please share this key with participants so they can decrypt messages.",
          });
          
          // Force admin to see the key
          setTimeout(() => {
            alert(`IMPORTANT: Share this encryption key with all participants:\n\n${encryptionKey}\n\nThis key is required to read encrypted messages!`);
          }, 1000);
        } 
        // If user is not admin but already a participant, try to get the key from a prompt
        else if (!encryptionKey && existingParticipant) {
          encryptionKey = promptForEncryptionKey(roomId);
          
          if (!encryptionKey) {
            toast({
              title: "Warning",
              description: "No encryption key provided. You won't be able to read encrypted messages.",
              variant: "destructive"
            });
          } else {
            toast({
              title: "Encryption Key Saved",
              description: "You can now decrypt messages in this room.",
            });
          }
        }
      
        // Create room object for the UI
        const newRoom: Room = {
          id: roomId,
          password: password,
          name: roomData.name,
          createdAt: new Date(roomData.created_at),
          admin: roomData.admin_id,
          participants: participantsData?.map(p => ({
            id: p.user_id,
            name: p.user_name,
            isAdmin: p.is_admin,
            joinedAt: new Date(p.joined_at)
          })) || [],
          messages: messagesData?.map(m => ({
            id: m.id,
            senderId: m.sender_id,
            senderName: m.sender_name,
            content: m.content,
            timestamp: new Date(m.created_at),
            isEncrypted: m.is_encrypted,
            isSystemMessage: m.is_system_message
          })) || [],
          encryptionKey: encryptionKey || undefined
        };
        
        // If admin, fetch join requests
        if (newRoom.admin === user.id) {
          await fetchJoinRequests();
        }
        
        // Set current room
        setCurrentRoom(newRoom);
        return true;
      } catch (error) {
        console.error("Error checking participant status:", error);
      }
      
      // If user is admin, they can join directly
      const { error: addParticipantError } = await supabase
        .from('participants')
        .insert({
          room_id: roomId,
          user_id: user.id,
          user_name: user.name,
          is_admin: roomData.admin_id === user.id
        });
      
      if (addParticipantError) {
        console.error('Error adding participant:', addParticipantError);
        toast({
          title: 'Error',
          description: 'Failed to join room. Please try again.',
          variant: 'destructive'
        });
        return false;
      }
      
      // Generate new encryption key for admin
      let encryptionKey = getRoomEncryptionKey(roomId);
      if (!encryptionKey && roomData.admin_id === user.id) {
        encryptionKey = generateRandomId(32);
        saveRoomEncryptionKey(roomId, encryptionKey);
        
        // Alert admin about the encryption key
        setTimeout(() => {
          alert(`IMPORTANT: Share this encryption key with all participants:\n\n${encryptionKey}\n\nThis key is required to read encrypted messages!`);
        }, 1000);
      } else if (!encryptionKey) {
        // Always prompt for encryption key for non-admin users
        encryptionKey = promptForEncryptionKey(roomId);
      }
      
      // Add system message
      const joinMessage: Message = {
        id: generateRandomId(),
        senderId: 'system',
        senderName: 'System',
        content: `${user.name} joined the room`,
        timestamp: new Date(),
        isEncrypted: false,
        isSystemMessage: true
      };
      
      // Insert the system message
      await supabase
        .from('messages')
        .insert({
          room_id: roomId,
          sender_id: 'system',
          sender_name: 'System',
          content: joinMessage.content,
          is_encrypted: false,
          is_system_message: true
        });
      
      console.log("User joined successfully");
      
      // Fetch all messages for this room
      const { data: messagesData } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });
      
      // Fetch all participants
      const { data: participantsData } = await supabase
        .from('participants')
        .select('*')
        .eq('room_id', roomId);
      
      // Create room object for the UI
      const newRoom: Room = {
        id: roomId,
        password: password,
        name: roomData.name,
        createdAt: new Date(roomData.created_at),
        admin: roomData.admin_id,
        participants: participantsData?.map(p => ({
          id: p.user_id,
          name: p.user_name,
          isAdmin: p.is_admin,
          joinedAt: new Date(p.joined_at)
        })) || [],
        messages: messagesData?.map(m => ({
          id: m.id,
          senderId: m.sender_id,
          senderName: m.sender_name,
          content: m.content,
          timestamp: new Date(m.created_at),
          isEncrypted: m.is_encrypted,
          isSystemMessage: m.is_system_message
        })) || [],
        encryptionKey: encryptionKey
      };
      
      // If admin, fetch join requests
      if (newRoom.admin === user.id) {
        await fetchJoinRequests();
      }
      
      // Set current room
      setCurrentRoom(newRoom);
      return true;
    } catch (error) {
      console.error("Error in joinRoom:", error);
      toast({
        title: "Error",
        description: "Failed to join room due to a technical error. Please try again.",
        variant: "destructive"
      });
      return false;
    }
  };

  // Leave the current room
  const leaveRoom = async () => {
    if (!currentRoom) return;
    
    try {
      const userId = sessionStorage.getItem('userId');
      const userName = sessionStorage.getItem('userName');
      
      if (!userId || !userName) return;
      
      // Remove user from participants
      await supabase
        .from('participants')
        .delete()
        .eq('room_id', currentRoom.id)
        .eq('user_id', userId);
      
      // Add system message about leaving
      await supabase
        .from('messages')
        .insert({
          room_id: currentRoom.id,
          sender_id: 'system',
          sender_name: 'System',
          content: `${userName} left the room`,
          is_encrypted: false,
          is_system_message: true
        });
      
      // Check participant count after user leaves
      const { data: participants, error } = await supabase
        .from('participants')
        .select('*')
        .eq('room_id', currentRoom.id);
      
      if (error) {
        console.error("Error checking participants:", error);
      }
      
      // If no participants left, delete the room immediately
      if (!participants || participants.length === 0) {
        console.log("No participants left, cleaning up room:", currentRoom.id);
        await cleanupRoom(currentRoom.id);
        
        // Remove from available rooms list
        setAvailableRooms(prev => prev.filter(room => room.id !== currentRoom.id));
      } 
      // If user is admin, transfer admin role
      else if (currentRoom.admin === userId) {
        // Transfer admin role to the earliest joined participant
        const nextAdmin = participants[0];
        
        await supabase
          .from('participants')
          .update({ is_admin: true })
          .eq('id', nextAdmin.id);
        
        await supabase
          .from('rooms')
          .update({ admin_id: nextAdmin.user_id })
          .eq('id', currentRoom.id);
        
        // Add system message about admin transfer
        await supabase
          .from('messages')
          .insert({
            room_id: currentRoom.id,
            sender_id: 'system',
            sender_name: 'System',
            content: `${userName} left the room. ${nextAdmin.user_name} is now the admin.`,
            is_encrypted: false,
            is_system_message: true
          });
      }
      
      // Update the available rooms list to reflect the changes
      await fetchAvailableRooms();
      setCurrentRoom(null);
    } catch (error) {
      console.error("Error in leaveRoom:", error);
    }
  };

  // Send a message to the current room
  const sendMessage = async (content: string, isSystem = false) => {
    if (!currentRoom) return;
    
    try {
      const userId = sessionStorage.getItem('userId');
      const userName = sessionStorage.getItem('userName');
      
      if (!userId || !userName) return;
      
      // Create message object
      const newMessage: Message = {
        id: generateRandomId(),
        senderId: isSystem ? 'system' : userId,
        senderName: isSystem ? 'System' : userName,
        content,
        timestamp: new Date(),
        isEncrypted: !isSystem && !!currentRoom.encryptionKey,
        isSystemMessage: isSystem
      };
      
      // If encryption is enabled and it's not a system message, encrypt the content
      let finalContent = content;
      if (currentRoom.encryptionKey && !isSystem) {
        // Fix: Await the async encryption function
        finalContent = await encryptMessageCompat(content, currentRoom.encryptionKey);
      }
      
      // Add message to Supabase
      await supabase
        .from('messages')
        .insert({
          room_id: currentRoom.id,
          sender_id: newMessage.senderId,
          sender_name: newMessage.senderName,
          content: finalContent,
          is_encrypted: newMessage.isEncrypted,
          is_system_message: isSystem
        });
      
      // Update local state immediately for better UX
      setCurrentRoom(prevRoom => {
        if (!prevRoom) return null;
        return {
          ...prevRoom,
          messages: [...prevRoom.messages, newMessage]
        };
      });
    } catch (error) {
      console.error("Error in sendMessage:", error);
    }
  };

  // Send a private message
  const sendPrivateMessage = async (receiverId: string, content: string) => {
    const userId = sessionStorage.getItem('userId');
    const userName = sessionStorage.getItem('userName');
    
    if (!userId || !userName) return;
    
    // Find if there's an existing private chat
    const chatId = [userId, receiverId].sort().join('-');
    let privateChat = privateChats.find(chat => chat.id === chatId);
    
    // If not, create a new private chat
    if (!privateChat) {
      privateChat = {
        id: chatId,
        participants: [userId, receiverId] as [string, string],
        messages: []
      };
      setPrivateChats([...privateChats, privateChat]);
    }
    
    // Add the message
    const newMessage: Message = {
      id: generateRandomId(),
      senderId: userId,
      senderName: userName,
      content,
      timestamp: new Date(),
      isEncrypted: true
    };
    
    privateChat.messages.push(newMessage);
    setPrivateChats(privateChats.map(chat => 
      chat.id === chatId ? {...chat, messages: [...chat.messages, newMessage]} : chat
    ));
    setActivePrivateChat(chatId);
  };

  const value = {
    currentRoom,
    setCurrentRoom,
    privateChats,
    setPrivateChats,
    activePrivateChat,
    setActivePrivateChat,
    createRoom,
    joinRoom,
    requestToJoinRoom,
    approveJoinRequest,
    rejectJoinRequest,
    leaveRoom,
    sendMessage,
    sendPrivateMessage,
    availableRooms,
    fetchJoinRequests,
  };

  return (
    <RoomContext.Provider value={value}>
      {children}
    </RoomContext.Provider>
  );
};
