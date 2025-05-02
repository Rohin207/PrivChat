import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, LogIn, Heart, Sparkles, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useUser, User } from "@/contexts/UserContext";
import { useRoom } from "@/contexts/RoomContext";
import { generateRandomId } from "@/utils/crypto";
import ThemeSwitcher from "./ThemeSwitcher";
import { useIsMobile } from "@/hooks/use-mobile";

const HomePage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setUser } = useUser();
  const { createRoom, joinRoom, availableRooms, requestToJoinRoom } = useRoom();
  const isMobile = useIsMobile();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isBrowseModalOpen, setIsBrowseModalOpen] = useState(false);
  
  const [name, setName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [selectedRoomName, setSelectedRoomName] = useState("");

  // Load stored username if available
  useEffect(() => {
    const storedName = sessionStorage.getItem('userName');
    if (storedName) {
      setName(storedName);
    }
  }, []);

  const handleCreateRoom = async () => {
    if (!name) {
      toast({
        title: "Error",
        description: "Please enter your name",
        variant: "destructive"
      });
      return;
    }

    try {
      // Create a user ID
      const userId = generateRandomId();
      
      // Create a new user object
      const user: User = {
        id: userId,
        name,
        isAdmin: true,
        joinedAt: new Date()
      };
      
      setUser(user);
      
      // Store user information
      sessionStorage.setItem('userId', userId);
      sessionStorage.setItem('userName', name);
      
      // Create a new room
      const room = await createRoom(roomName, userId, name);
      
      // Show the room credentials
      toast({
        title: "Room Created Successfully",
        description: `Room ID: ${room.id}\nPassword: ${room.password}\nShare these with your partner!`,
      });
      
      // Store encryption key
      if (room.encryptionKey) {
        sessionStorage.setItem(`room_${room.id}_key`, room.encryptionKey);
      }
      
      // Navigate to the room
      navigate(`/room/${room.id}`);
    } catch (error) {
      console.error("Error creating room:", error);
      toast({
        title: "Error",
        description: "Failed to create room. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleJoinRoom = async () => {
    if (!name || !roomId || !roomPassword) {
      toast({
        title: "Error",
        description: "Please enter your name, room ID and password",
        variant: "destructive"
      });
      return;
    }

    try {
      console.log("Joining room with:", {
        name,
        roomId,
        password: roomPassword
      });

      const userId = generateRandomId();
      const user: User = {
        id: userId,
        name,
        joinedAt: new Date()
      };
      
      setUser(user);
      
      sessionStorage.setItem('userId', userId);
      sessionStorage.setItem('userName', name);
      
      // Try to join the room
      const success = await joinRoom(roomId, roomPassword, user);
      
      if (success) {
        // The joinRoom function will either join directly (if admin) or send a request
        navigate(`/room/${roomId}`);
      }
      
      setIsJoinModalOpen(false);
    } catch (error) {
      console.error("Error joining room:", error);
      toast({
        title: "Error",
        description: "Failed to join room. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleSelectRoom = (id: string, name: string) => {
    setSelectedRoomId(id);
    setSelectedRoomName(name);
    setRoomId(id);
    setIsBrowseModalOpen(false);
    setIsJoinModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Romantic Theme Effects */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="romantic-theme absolute inset-0">
          {Array.from({ length: isMobile ? 10 : 20 }).map((_, i) => (
            <Heart
              key={i}
              className="absolute animate-float text-primary/20"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                transform: `scale(${0.5 + Math.random()})`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Hacker Theme Effects */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="hacker-theme absolute inset-0">
          <div className="cipher-background opacity-20" />
          {Array.from({ length: isMobile ? 8 : 15 }).map((_, i) => (
            <Sparkles
              key={i}
              className="absolute animate-pulse text-primary/30"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
              }}
            />
          ))}
        </div>
      </div>

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

          <Button 
            variant="ghost" 
            size="lg" 
            className="space-x-2 w-full"
            onClick={() => setIsBrowseModalOpen(true)}
          >
            <Search size={20} />
            <span>Browse Available Rooms</span>
          </Button>
        </div>
        
        <div className="text-center text-sm text-muted-foreground">
          <p>All messages are end-to-end encrypted.</p>
          <p>Your privacy is our priority.</p>
        </div>
      </div>
      
      {/* Create Room Dialog */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className={`${isMobile ? 'w-[90vw] max-w-[90vw]' : ''}`}>
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
              <Label htmlFor="roomName">Room Name (Optional)</Label>
              <Input 
                id="roomName" 
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
        <DialogContent className={`${isMobile ? 'w-[90vw] max-w-[90vw]' : ''}`}>
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

            <div className="space-y-2">
              <Label htmlFor="room-password">Room Password</Label>
              <Input 
                id="room-password"
                type="password"
                placeholder="Enter room password" 
                value={roomPassword} 
                onChange={(e) => setRoomPassword(e.target.value)}
              />
            </div>
            
            <div className="text-sm text-muted-foreground">
              <p>Note: If you're not the admin, your request to join will need approval.</p>
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

      {/* Browse Rooms Dialog */}
      <Dialog open={isBrowseModalOpen} onOpenChange={setIsBrowseModalOpen}>
        <DialogContent className={`${isMobile ? 'w-[90vw] max-w-[90vw]' : ''}`}>
          <DialogHeader>
            <DialogTitle>Available Rooms</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {availableRooms.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No rooms available. Create one!
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {availableRooms.map((room) => (
                  <div 
                    key={room.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleSelectRoom(room.id, room.name)}
                  >
                    <div>
                      <div className="font-medium">{room.name}</div>
                      <div className="text-xs text-muted-foreground">ID: {room.id}</div>
                    </div>
                    <Button size="sm" variant="outline">
                      Join
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBrowseModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setIsCreateModalOpen(true)}>
              Create New Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HomePage;
