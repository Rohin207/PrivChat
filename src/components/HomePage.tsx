
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useUser, User } from "@/contexts/UserContext";
import { useRoom } from "@/contexts/RoomContext";
import { generateRandomId } from "@/utils/crypto";
import ThemeSwitcher from "./ThemeSwitcher";

const HomePage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setUser } = useUser();
  const { createRoom, joinRoom } = useRoom();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  
  const [name, setName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomId, setRoomId] = useState("");

  const handleCreateRoom = () => {
    if (!name || !roomName) {
      toast({
        title: "Error",
        description: "Please enter your name and a room name",
        variant: "destructive"
      });
      return;
    }

    // Create a user ID
    const userId = generateRandomId();
    
    // Create a new user object
    const user: User = {
      id: userId,
      name,
      isAdmin: true,
      joinedAt: new Date()
    };
    
    // Set the user in context
    setUser(user);
    
    // Store user information in session storage
    sessionStorage.setItem('userId', userId);
    sessionStorage.setItem('userName', name);
    
    // Create a new room
    const room = createRoom(roomName, userId, name);
    
    // Navigate to the room
    navigate(`/room/${room.id}`);
  };

  const handleJoinRoom = () => {
    if (!name || !roomId) {
      toast({
        title: "Error",
        description: "Please enter your name and a room ID",
        variant: "destructive"
      });
      return;
    }

    // Create a user ID
    const userId = generateRandomId();
    
    // Create a new user object
    const user: User = {
      id: userId,
      name,
      joinedAt: new Date()
    };
    
    // Set the user in context
    setUser(user);
    
    // Store user information in session storage
    sessionStorage.setItem('userId', userId);
    sessionStorage.setItem('userName', name);
    
    // Join the room
    const success = joinRoom(roomId, user);
    
    if (success) {
      // Navigate to the room
      navigate(`/room/${roomId}`);
    } else {
      toast({
        title: "Error",
        description: "Room not found. Please check the room ID and try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeSwitcher />
      </div>
      
      <div className="glass p-8 rounded-2xl w-full max-w-md flex flex-col items-center space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Secret Room</h1>
          <p className="text-muted-foreground">End-to-end encrypted chat rooms</p>
        </div>
        
        <div className="flex flex-col space-y-4 w-full">
          <Button 
            size="lg" 
            className="space-x-2 w-full" 
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={20} />
            <span>Create Room</span>
          </Button>
          
          <Button 
            variant="outline" 
            size="lg" 
            className="space-x-2 w-full"
            onClick={() => setIsJoinModalOpen(true)}
          >
            <LogIn size={20} />
            <span>Join Room</span>
          </Button>
        </div>
        
        <div className="text-center text-sm text-muted-foreground">
          <p>All messages are end-to-end encrypted.</p>
          <p>Your privacy is our priority.</p>
        </div>
      </div>
      
      {/* Create Room Dialog */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a New Room</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input 
                id="name" 
                placeholder="Enter your name" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="room-name">Room Name</Label>
              <Input 
                id="room-name" 
                placeholder="Enter room name" 
                value={roomName} 
                onChange={(e) => setRoomName(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateRoom}>
              Create Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Join Room Dialog */}
      <Dialog open={isJoinModalOpen} onOpenChange={setIsJoinModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join a Room</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="join-name">Your Name</Label>
              <Input 
                id="join-name" 
                placeholder="Enter your name" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="room-id">Room ID</Label>
              <Input 
                id="room-id" 
                placeholder="Enter room ID" 
                value={roomId} 
                onChange={(e) => setRoomId(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsJoinModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleJoinRoom}>
              Join Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HomePage;
