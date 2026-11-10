import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarEvent, eventColors, Weekday } from "@/types/calendar";

interface EventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEvent | null;
  selectedDay?: Weekday;
  defaultStartTime?: string;
  onSave: (event: Omit<CalendarEvent, "id"> & { id?: string }) => void;
  onDelete?: (id: string) => void;
}

export function EventModal({
  open,
  onOpenChange,
  event,
  selectedDay,
  defaultStartTime = "09:00",
  onSave,
  onDelete,
}: EventModalProps) {
  const [title, setTitle] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState<Weekday>("Mon");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [color, setColor] = useState(eventColors[0].value);
  const weekDays: { value: Weekday; label: string }[] = [
    { value: "Mon", label: "Monday" },
    { value: "Tue", label: "Tuesday" },
    { value: "Wed", label: "Wednesday" },
    { value: "Thu", label: "Thursday" },
    { value: "Fri", label: "Friday" },
  ];

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDayOfWeek(event.dayOfWeek);
      setStartTime(event.startTime);
      setEndTime(event.endTime);
      setColor(event.color);
    } else {
      setTitle("");
      setDayOfWeek(selectedDay || "Mon");
      setStartTime(defaultStartTime);
      const [hours] = defaultStartTime.split(":").map(Number);
      setEndTime(`${(hours + 1).toString().padStart(2, "0")}:00`);
      setColor(eventColors[0].value);
    }
  }, [event, selectedDay, open, defaultStartTime]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSave({
      id: event?.id,
      title: title.trim(),
      dayOfWeek,
      startTime,
      endTime,
      color,
    });
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (event && onDelete) {
      onDelete(event.id);
      onOpenChange(false);
    }
  };

  const isEditing = !!event;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Event" : "Add Event"}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Make changes to your event."
                : "Create a new event on your calendar."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Event Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter event title"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-day">Day</Label>
              <Select value={dayOfWeek} onValueChange={(value) => setDayOfWeek(value as Weekday)}>
                <SelectTrigger id="event-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weekDays.map((day) => (
                    <SelectItem key={day.value} value={day.value}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">End Time</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-color">Color</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger id="event-color">
                  <SelectValue>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      {eventColors.find((c) => c.value === color)?.label}
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {eventColors.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: c.value }}
                        />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {isEditing && onDelete && !event?.isCourse && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                className="mr-auto"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
            <Button type="submit" className="rounded-full">
              {isEditing ? "Save Changes" : "Add Event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
