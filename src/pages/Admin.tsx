import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import AdminAuth from "@/components/AdminAuth";

interface Room {
  id: string;
  name: string;
  created_at: string;
  participant_count?: number;
}

const Admin = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if previously authenticated
    const adminAuth = localStorage.getItem("admin_authenticated");
    if (adminAuth === "true") {
      setIsAuthenticated(true);
      fetchRooms();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      // Get all rooms
      const { data: roomsData, error: roomsError } = await supabase
        .from('rooms')
        .select('id, name, created_at')
        .order('created_at', { ascending: false });

      if (roomsError) {
        toast.error("Failed to fetch rooms");
        console.error(roomsError);
        setLoading(false);
        return;
      }

      // For each room, get participant count
      const roomsWithParticipants = await Promise.all(
        (roomsData || []).map(async (room) => {
          const { count, error } = await supabase
            .from('participants')
            .select('*', { count: 'exact', head: true })
            .eq('room_id', room.id);

          return {
            ...room,
            participant_count: count || 0
          };
        })
      );

      setRooms(roomsWithParticipants);
    } catch (error) {
      console.error("Error fetching rooms:", error);
      toast.error("Something went wrong while fetching rooms");
    } finally {
      setLoading(false);
    }
  };

  const cleanupRoom = async (roomId: string) => {
    setDeleting(roomId);
    try {
      // Delete all messages for this room
      await supabase
        .from('messages')
        .delete()
        .eq('room_id', roomId);
      
      // Delete all join requests for this room
      await supabase
        .from('join_requests')
        .delete()
        .eq('room_id', roomId);
      
      // Delete all participants for this room
      await supabase
        .from('participants')
        .delete()
        .eq('room_id', roomId);
      
      // Finally delete the room itself
      await supabase
        .from('rooms')
        .delete()
        .eq('id', roomId);
      
      toast.success("Room deleted successfully");
      
      // Update the rooms list
      setRooms(rooms.filter(room => room.id !== roomId));
    } catch (error) {
      console.error("Error deleting room:", error);
      toast.error("Failed to delete room");
    } finally {
      setDeleting(null);
    }
  };

  const cleanupAllRooms = async () => {
    if (!confirm("Are you sure you want to delete ALL rooms? This cannot be undone.")) {
      return;
    }
    
    setLoading(true);
    try {
      // Delete all messages
      await supabase.from('messages').delete().neq('room_id', 'dummy');
      
      // Delete all join requests
      await supabase.from('join_requests').delete().neq('room_id', 'dummy');
      
      // Delete all participants
      await supabase.from('participants').delete().neq('room_id', 'dummy');
      
      // Delete all rooms
      await supabase.from('rooms').delete().neq('id', 'dummy');
      
      toast.success("All rooms deleted successfully");
      setRooms([]);
    } catch (error) {
      console.error("Error deleting all rooms:", error);
      toast.error("Failed to delete all rooms");
    } finally {
      setLoading(false);
    }
  };

  // Display auth screen if not authenticated
  if (!isAuthenticated) {
    return <AdminAuth onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Room Admin Panel</h1>
        <div className="flex gap-2">
          <Button onClick={fetchRooms} variant="outline" disabled={loading}>
            Refresh
          </Button>
          <Button onClick={cleanupAllRooms} variant="destructive" disabled={loading}>
            Delete All Rooms
          </Button>
          <Button
            onClick={() => {
              localStorage.removeItem("admin_authenticated");
              setIsAuthenticated(false);
            }}
            variant="destructive"
          >
            Logout
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Back to Home</Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading rooms...</div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No rooms found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map(room => (
            <Card key={room.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex justify-between items-center">
                  <span>{room.name || `Room-${room.id.slice(0, 6)}`}</span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => cleanupRoom(room.id)}
                    disabled={deleting === room.id}
                  >
                    <Trash2 className="h-5 w-5 text-destructive" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div><strong>ID:</strong> {room.id}</div>
                  <div><strong>Created:</strong> {new Date(room.created_at).toLocaleString()}</div>
                  <div className="flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    <span>{room.participant_count} participants</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Admin;
