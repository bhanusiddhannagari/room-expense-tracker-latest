import { useState, useMemo, useEffect } from "react";
import { format, parseISO, startOfMonth, addMonths, subMonths, getDaysInMonth, getDay, isToday } from "date-fns";
import { useApp } from "@/hooks/use-app-store";
import { Schedule } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Trash2,
  Edit,
  User,
  CalendarDays,
  List,
  RefreshCw,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Category color mappings
const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "Room Cleaning": {
    bg: "bg-blue-50 dark:bg-blue-950/60",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800",
    dot: "bg-blue-500",
  },
  "Vessel Cleaning": {
    bg: "bg-cyan-50 dark:bg-cyan-950/60",
    text: "text-cyan-700 dark:text-cyan-300",
    border: "border-cyan-200 dark:border-cyan-800",
    dot: "bg-cyan-500",
  },
  "Grocery": {
    bg: "bg-emerald-50 dark:bg-emerald-950/60",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  "Bill Payment": {
    bg: "bg-amber-50 dark:bg-amber-950/60",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  "Maintenance": {
    bg: "bg-orange-50 dark:bg-orange-950/60",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-800",
    dot: "bg-orange-500",
  },
  "Other": {
    bg: "bg-purple-50 dark:bg-purple-950/60",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-200 dark:border-purple-800",
    dot: "bg-purple-500",
  },
};

function getCategoryStyle(categoryName: string) {
  return CATEGORY_STYLES[categoryName] || {
    bg: "bg-slate-100 dark:bg-slate-900/60",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-800",
    dot: "bg-slate-500",
  };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SchedulesPage() {
  const {
    schedules,
    scheduleCategories,
    currentUser,
    availableMonths,
    activeMonth,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    refreshState,
  } = useApp();

  // ── Month Selection ──
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initialize selectedMonth with activeMonth or current month
  useEffect(() => {
    if (!selectedMonth) {
      if (activeMonth) {
        setSelectedMonth(activeMonth);
      } else if (availableMonths.length > 0) {
        setSelectedMonth(availableMonths[0]);
      } else {
        setSelectedMonth(format(new Date(), "yyyy-MM"));
      }
    }
  }, [activeMonth, availableMonths, selectedMonth]);

  // Combined month options for the dropdown
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    availableMonths.forEach(m => set.add(m));
    if (activeMonth) set.add(activeMonth);
    const nowMonth = format(new Date(), "yyyy-MM");
    set.add(nowMonth);
    if (selectedMonth) set.add(selectedMonth);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [availableMonths, activeMonth, selectedMonth]);

  // Current parsed date from selectedMonth
  const currentMonthDate = useMemo(() => {
    return selectedMonth ? parseISO(`${selectedMonth}-01`) : new Date();
  }, [selectedMonth]);

  // Filter schedules strictly for selected month (Requirement 2.3)
  const monthSchedules = useMemo(() => {
    return schedules.filter(s => s.month === selectedMonth);
  }, [schedules, selectedMonth]);

  // Group schedules by date
  const schedulesByDate = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    monthSchedules.forEach(s => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    // Sort ascending by start_time
    Object.values(map).forEach(list =>
      list.sort((a, b) => a.startTime.localeCompare(b.startTime))
    );
    return map;
  }, [monthSchedules]);

  // Calendar grid calculations
  const totalDays = useMemo(() => {
    return getDaysInMonth(currentMonthDate);
  }, [currentMonthDate]);

  const startDayOfWeek = useMemo(() => {
    return getDay(startOfMonth(currentMonthDate));
  }, [currentMonthDate]);

  // ── Dialog States ──
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [viewingSchedule, setViewingSchedule] = useState<Schedule | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state for Add/Edit
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("");
  const [formType, setFormType] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available schedule categories (dynamic with defaults)
  const categoryNames = useMemo(() => {
    if (scheduleCategories && scheduleCategories.length > 0) {
      return scheduleCategories.map(c => c.name);
    }
    return ["Room Cleaning", "Vessel Cleaning", "Grocery", "Bill Payment", "Maintenance", "Other"];
  }, [scheduleCategories]);

  // Open Add Dialog with pre-filled date
  const handleOpenAdd = (dateStr?: string) => {
    const initialDate = dateStr || (selectedMonth ? `${selectedMonth}-01` : format(new Date(), "yyyy-MM-dd"));
    setEditingSchedule(null);
    setFormTitle("");
    setFormDate(initialDate);
    setFormStartTime("09:00");
    setFormEndTime("");
    setFormType(categoryNames[0] || "Room Cleaning");
    setFormDescription("");
    setFormError("");
    setIsAddOpen(true);
  };

  // Open Edit Dialog
  const handleOpenEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setViewingSchedule(null);
    setFormTitle(schedule.title);
    setFormDate(schedule.date);
    setFormStartTime(schedule.startTime);
    setFormEndTime(schedule.endTime || "");
    setFormType(schedule.type);
    setFormDescription(schedule.description || "");
    setFormError("");
    setIsAddOpen(true);
  };

  // Submit Add / Edit
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setFormError("Title is required.");
      return;
    }
    if (!formDate) {
      setFormError("Date is required.");
      return;
    }
    if (!formStartTime) {
      setFormError("Start time is required.");
      return;
    }
    if (!formType) {
      setFormError("Schedule type is required.");
      return;
    }

    const month = format(parseISO(formDate), "yyyy-MM");
    setIsSubmitting(true);
    try {
      if (editingSchedule) {
        await updateSchedule({
          ...editingSchedule,
          title: formTitle.trim(),
          date: formDate,
          month,
          startTime: formStartTime,
          endTime: formEndTime.trim() || undefined,
          type: formType,
          description: formDescription.trim() || undefined,
        });
      } else {
        await addSchedule({
          title: formTitle.trim(),
          date: formDate,
          month,
          startTime: formStartTime,
          endTime: formEndTime.trim() || undefined,
          type: formType,
          description: formDescription.trim() || undefined,
          createdBy: currentUser?.name || currentUser?.username || "Roommate",
        });
      }
      setIsAddOpen(false);
      // Auto switch month if added to another month
      if (month !== selectedMonth) {
        setSelectedMonth(month);
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to save schedule.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete handler
  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteSchedule(deletingId);
      setDeletingId(null);
      setViewingSchedule(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Month navigation helpers
  const handlePrevMonth = () => {
    const prev = subMonths(currentMonthDate, 1);
    setSelectedMonth(format(prev, "yyyy-MM"));
  };

  const handleNextMonth = () => {
    const next = addMonths(currentMonthDate, 1);
    setSelectedMonth(format(next, "yyyy-MM"));
  };

  const handleToday = () => {
    setSelectedMonth(format(new Date(), "yyyy-MM"));
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshState();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Permissions check for edit/delete
  const canManageSchedule = (schedule: Schedule | null) => {
    if (!schedule || !currentUser) return false;
    return (
      currentUser.role === "admin" ||
      currentUser.name === schedule.createdBy ||
      currentUser.username === schedule.createdBy
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-8 w-8 text-primary" />
            Schedules
          </h1>
          <p className="text-muted-foreground">
            Schedule and track room cleaning, chores, grocery runs, and room events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh schedules"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
          <Button onClick={() => handleOpenAdd()} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Schedule
          </Button>
        </div>
      </div>

      {/* ── Controls Bar: Navigation & Month Filter ── */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Navigation Controls */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
            <div className="flex items-center border rounded-md">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-r-none"
                onClick={handlePrevMonth}
                title="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-l-none"
                onClick={handleNextMonth}
                title="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <h2 className="text-lg font-semibold tracking-tight ml-2">
              {format(currentMonthDate, "MMMM yyyy")}
            </h2>
          </div>

          {/* Month Filter Dropdown & View Mode Switch */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Month:</span>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="Select Month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(m => (
                    <SelectItem key={m} value={m}>
                      {format(parseISO(`${m}-01`), "MMMM yyyy")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Toggle Calendar / List View */}
            <div className="flex items-center border rounded-md p-0.5 bg-muted/40">
              <Button
                variant={viewMode === "calendar" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2.5"
                onClick={() => setViewMode("calendar")}
              >
                <CalendarIcon className="h-4 w-4 mr-1.5" />
                Calendar
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2.5"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4 mr-1.5" />
                List
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── View: Monthly Calendar ── */}
      {viewMode === "calendar" ? (
        <Card className="overflow-hidden shadow-sm">
          <CardContent className="p-0">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b bg-muted/30 text-center font-medium text-xs sm:text-sm text-muted-foreground py-2.5">
              {WEEKDAYS.map(day => (
                <div key={day} className="truncate">
                  {day}
                </div>
              ))}
            </div>

            {/* Monthly Day Grid */}
            <div className="grid grid-cols-7 auto-rows-fr bg-border gap-px">
              {/* Empty padding cells for start of month */}
              {Array.from({ length: startDayOfWeek }).map((_, i) => (
                <div key={`empty-start-${i}`} className="min-h-[105px] sm:min-h-[120px] bg-muted/10 p-1.5" />
              ))}

              {/* Day cells */}
              {Array.from({ length: totalDays }).map((_, index) => {
                const dayNum = index + 1;
                const dayStr = String(dayNum).padStart(2, "0");
                const fullDateStr = `${selectedMonth}-${dayStr}`;
                const daySchedules = schedulesByDate[fullDateStr] || [];
                const isCurrentToday = isToday(parseISO(fullDateStr));

                return (
                  <div
                    key={fullDateStr}
                    className={cn(
                      "min-h-[105px] sm:min-h-[120px] bg-background p-1.5 flex flex-col justify-between group transition-colors hover:bg-muted/20 relative",
                      isCurrentToday && "bg-primary/5"
                    )}
                  >
                    {/* Day number header & quick add */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center text-xs font-semibold h-6 w-6 rounded-full",
                          isCurrentToday
                            ? "bg-primary text-primary-foreground font-bold shadow-xs"
                            : "text-foreground/80"
                        )}
                      >
                        {dayNum}
                      </span>
                      <button
                        onClick={() => handleOpenAdd(fullDateStr)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                        title={`Add schedule for ${fullDateStr}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Schedules Pills for this Day */}
                    <div className="flex-1 space-y-1 overflow-y-auto max-h-[85px] scrollbar-none">
                      {daySchedules.map(schedule => {
                        const style = getCategoryStyle(schedule.type);
                        return (
                          <div
                            key={schedule.id}
                            onClick={() => setViewingSchedule(schedule)}
                            className={cn(
                              "text-xs p-1 rounded border cursor-pointer transition-all hover:scale-[1.02] flex items-center gap-1.5 shadow-2xs font-medium truncate",
                              style.bg,
                              style.text,
                              style.border
                            )}
                            title={`${schedule.startTime} - ${schedule.title} (${schedule.type})`}
                          >
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", style.dot)} />
                            <span className="font-mono text-[10px] shrink-0 opacity-80">
                              {schedule.startTime}
                            </span>
                            <span className="truncate">{schedule.title}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Trailing padding cells to complete final row */}
              {Array.from({
                length: (7 - ((startDayOfWeek + totalDays) % 7)) % 7,
              }).map((_, i) => (
                <div key={`empty-end-${i}`} className="min-h-[105px] sm:min-h-[120px] bg-muted/10 p-1.5" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* ── View: Chronological List of Selected Month ── */
        <div className="space-y-4">
          {monthSchedules.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-base font-medium">No schedules found for {format(currentMonthDate, "MMMM yyyy")}.</p>
                <p className="text-sm mt-1">Get started by creating a new activity or chore schedule.</p>
                <Button onClick={() => handleOpenAdd()} variant="outline" className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Add Schedule
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {Object.keys(schedulesByDate)
                .sort()
                .map(dateKey => {
                  const dayList = schedulesByDate[dateKey];
                  const parsedDay = parseISO(dateKey);
                  return (
                    <Card key={dateKey} className="overflow-hidden">
                      <CardHeader className="py-2.5 px-4 bg-muted/20 border-b flex flex-row items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">
                            {format(parsedDay, "EEEE, MMMM d, yyyy")}
                          </span>
                          {isToday(parsedDay) && (
                            <Badge variant="secondary" className="text-xs">
                              Today
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {dayList.length} {dayList.length === 1 ? "item" : "items"}
                        </span>
                      </CardHeader>
                      <CardContent className="p-3 divide-y divide-border/60">
                        {dayList.map(schedule => {
                          const style = getCategoryStyle(schedule.type);
                          return (
                            <div
                              key={schedule.id}
                              className="py-2 flex items-center justify-between gap-3 hover:bg-muted/20 px-2 rounded-md transition-colors cursor-pointer"
                              onClick={() => setViewingSchedule(schedule)}
                            >
                              <div className="flex items-center gap-3">
                                <span className={cn("px-2 py-0.5 rounded text-xs border font-medium", style.bg, style.text, style.border)}>
                                  {schedule.type}
                                </span>
                                <div>
                                  <div className="font-medium text-sm">{schedule.title}</div>
                                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                    <span className="flex items-center gap-1 font-mono">
                                      <Clock className="h-3 w-3" />
                                      {schedule.startTime}
                                      {schedule.endTime ? ` - ${schedule.endTime}` : ""}
                                    </span>
                                    <span>•</span>
                                    <span>By {schedule.createdBy}</span>
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={e => {
                                  e.stopPropagation();
                                  setViewingSchedule(schedule);
                                }}
                              >
                                View
                              </Button>
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ── Dialog: Add / Edit Schedule ── */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSubmitForm}>
            <DialogHeader>
              <DialogTitle>{editingSchedule ? "Edit Schedule" : "Add Schedule"}</DialogTitle>
              <DialogDescription>
                Schedule an upcoming chore, cleaning, grocery trip, or bill reminder.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {formError && (
                <div className="p-3 text-xs bg-destructive/10 border border-destructive/20 text-destructive rounded-md">
                  {formError}
                </div>
              )}

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Schedule Title *</label>
                <Input
                  placeholder="e.g. Living room & kitchen cleaning"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  required
                />
              </div>

              {/* Type / Category */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Category / Type *</label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryNames.map(name => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date *</label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  required
                />
              </div>

              {/* Start & End Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Start Time *</label>
                  <Input
                    type="time"
                    value={formStartTime}
                    onChange={e => setFormStartTime(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">End Time (Optional)</label>
                  <Input
                    type="time"
                    value={formEndTime}
                    onChange={e => setFormEndTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Description / Notes */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description / Notes (Optional)</label>
                <Textarea
                  placeholder="Add details, room instructions, or grocery items..."
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editingSchedule ? "Update Schedule" : "Create Schedule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Schedule Details (Requirement 2.4) ── */}
      <Dialog open={!!viewingSchedule} onOpenChange={open => !open && setViewingSchedule(null)}>
        {viewingSchedule && (
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                {(() => {
                  const style = getCategoryStyle(viewingSchedule.type);
                  return (
                    <span className={cn("px-2.5 py-0.5 rounded text-xs border font-medium", style.bg, style.text, style.border)}>
                      {viewingSchedule.type}
                    </span>
                  );
                })()}
              </div>
              <DialogTitle className="text-xl font-bold">{viewingSchedule.title}</DialogTitle>
            </DialogHeader>

            <div className="space-y-3.5 py-3 text-sm">
              {/* Date */}
              <div className="flex items-center gap-2.5 text-muted-foreground">
                <CalendarIcon className="h-4 w-4 text-primary" />
                <span className="text-foreground font-medium">
                  {format(parseISO(viewingSchedule.date), "EEEE, MMMM d, yyyy")}
                </span>
              </div>

              {/* Time */}
              <div className="flex items-center gap-2.5 text-muted-foreground">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-foreground font-mono">
                  {viewingSchedule.startTime}
                  {viewingSchedule.endTime ? ` – ${viewingSchedule.endTime}` : ""}
                </span>
              </div>

              {/* Description */}
              {viewingSchedule.description && (
                <div className="p-3 bg-muted/30 rounded-md border text-sm whitespace-pre-wrap">
                  {viewingSchedule.description}
                </div>
              )}

              {/* Meta: Created by & Created at */}
              <div className="pt-2 border-t text-xs text-muted-foreground flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  <span>Created by <strong className="text-foreground">{viewingSchedule.createdBy}</strong></span>
                </div>
                <div>
                  Created on:{" "}
                  {viewingSchedule.createdAt
                    ? format(parseISO(viewingSchedule.createdAt), "PPP p")
                    : "N/A"}
                </div>
              </div>
            </div>

            <DialogFooter className="flex sm:justify-between items-center w-full">
              {canManageSchedule(viewingSchedule) ? (
                <div className="flex items-center gap-2 w-full justify-between">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setDeletingId(viewingSchedule.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleOpenEdit(viewingSchedule)}
                    >
                      <Edit className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setViewingSchedule(null)}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setViewingSchedule(null)}
                >
                  Close
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Alert: Confirm Delete ── */}
      <AlertDialog open={!!deletingId} onOpenChange={open => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this schedule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
