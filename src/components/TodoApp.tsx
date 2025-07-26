import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Filter, CheckCircle2, Circle, Trash2, Edit3, X, Check, Calendar, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { format, isAfter, isBefore, differenceInMinutes, isToday } from 'date-fns';

// Utility function to sanitize text and prevent XSS
const sanitizeText = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: Date;
  dueDate?: Date;
}

// Add interface for parsed todo data from localStorage
interface ParsedTodo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  dueDate?: string;
}

type FilterType = 'all' | 'active' | 'completed';

const TodoApp = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState('');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const { toast } = useToast();

  // Request notification permission and load todos
  useEffect(() => {
    const requestNotificationPermission = async () => {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
      }
    };
    
    requestNotificationPermission();
    
    const savedTodos = localStorage.getItem('futuristic-todos');
    if (savedTodos) {
      try {
        const parsedTodos = JSON.parse(savedTodos).map((todo: ParsedTodo) => ({
          ...todo,
          createdAt: new Date(todo.createdAt),
          dueDate: todo.dueDate ? new Date(todo.dueDate) : undefined
        }));
        setTodos(parsedTodos);
      } catch (error) {
        console.error('Error parsing saved todos:', error);
        // Clear corrupted data
        localStorage.removeItem('futuristic-todos');
      }
    }
  }, []);

  // Save todos to localStorage whenever todos change
  useEffect(() => {
    localStorage.setItem('futuristic-todos', JSON.stringify(todos));
  }, [todos]);

  // Check for due tasks and send notifications
  const checkNotifications = useCallback(() => {
    if (notificationPermission !== 'granted') return;

    const now = new Date();
    const shownNotifications = JSON.parse(localStorage.getItem('shown-notifications') || '[]');
    const updatedNotifications: string[] = [];
    
    todos.forEach(todo => {
      if (todo.completed || !todo.dueDate) return;

      const minutesUntilDue = differenceInMinutes(todo.dueDate, now);
      const isOverdue = isBefore(todo.dueDate, now);
      const isDueSoon = minutesUntilDue > 0 && minutesUntilDue <= 15;

      // Create unique notification key to prevent duplicate notifications
      const notificationKey = `${todo.id}-${todo.dueDate.getTime()}`;
      
      // Clean up old notifications (older than 24 hours)
      const oneDayAgo = now.getTime() - (24 * 60 * 60 * 1000);
      const isOldNotification = todo.dueDate.getTime() < oneDayAgo;
      
      if (!isOldNotification) {
        updatedNotifications.push(notificationKey);
      }

      if ((isOverdue || isDueSoon) && !shownNotifications.includes(notificationKey)) {
        const title = isOverdue ? 'Task Overdue!' : 'Task Due Soon!';
        const body = isOverdue 
          ? `"${todo.text}" was due ${format(todo.dueDate, 'PPp')}`
          : `"${todo.text}" is due in ${minutesUntilDue} minutes`;

        new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: todo.id
        });

        // Mark notification as shown
        updatedNotifications.push(notificationKey);
        
        // Show in-app toast
        toast({
          title,
          description: body,
          variant: isOverdue ? 'destructive' : 'default'
        });
      }
    });
    
    // Limit the size of notifications array to prevent localStorage bloat
    const maxNotifications = 100;
    const finalNotifications = updatedNotifications.slice(-maxNotifications);
    localStorage.setItem('shown-notifications', JSON.stringify(finalNotifications));
  }, [todos, notificationPermission, toast]);

  // Check notifications every minute
  useEffect(() => {
    checkNotifications(); // Check immediately
    const interval = setInterval(checkNotifications, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [checkNotifications]);

  // Helper functions for task status
  const isTaskOverdue = (todo: Todo) => {
    return todo.dueDate && !todo.completed && isBefore(todo.dueDate, new Date());
  };

  const isTaskDueToday = (todo: Todo) => {
    return todo.dueDate && isToday(todo.dueDate);
  };

  const isTaskDueSoon = (todo: Todo) => {
    if (!todo.dueDate || todo.completed) return false;
    const minutesUntilDue = differenceInMinutes(todo.dueDate, new Date());
    return minutesUntilDue > 0 && minutesUntilDue <= 60;
  };

  const addTodo = () => {
    if (inputValue.trim()) {
      let dueDate: Date | undefined;
      
      if (selectedDate && selectedTime) {
        const [hours, minutes] = selectedTime.split(':').map(Number);
        dueDate = new Date(selectedDate);
        dueDate.setHours(hours, minutes, 0, 0);
      } else if (selectedDate) {
        dueDate = new Date(selectedDate);
        dueDate.setHours(23, 59, 0, 0); // End of day if no time specified
      }

      const newTodo: Todo = {
        id: Date.now().toString(),
        text: sanitizeText(inputValue.trim()),
        completed: false,
        createdAt: new Date(),
        dueDate
      };
      setTodos([newTodo, ...todos]);
      setInputValue('');
      setSelectedDate(undefined);
      setSelectedTime('');
      toast({
        title: "Task Added",
        description: dueDate 
          ? `Task scheduled for ${format(dueDate, 'PPp')}`
          : "Your futuristic task has been logged to the system.",
      });
    }
  };

  const toggleTodo = (id: string) => {
    setTodos(todos.map(todo => 
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
    const todo = todos.find(t => t.id === id);
    if (todo) {
      toast({
        title: todo.completed ? "Task Reactivated" : "Task Completed",
        description: todo.completed ? "Task moved back to active status." : "Task marked as completed. Well done!",
      });
    }
  };

  const deleteTodo = (id: string) => {
    setTodos(todos.filter(todo => todo.id !== id));
    toast({
      title: "Task Deleted",
      description: "Task has been removed from the system.",
      variant: "destructive",
    });
  };

  const startEditing = (id: string, text: string) => {
    setEditingId(id);
    setEditValue(text);
  };

  const saveEdit = () => {
    if (editValue.trim() && editingId) {
      setTodos(todos.map(todo => 
        todo.id === editingId ? { ...todo, text: sanitizeText(editValue.trim()) } : todo
      ));
      setEditingId(null);
      setEditValue('');
      toast({
        title: "Task Updated",
        description: "Task has been successfully modified.",
      });
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const filteredTodos = todos.filter(todo => {
    const matchesFilter = 
      filter === 'all' || 
      (filter === 'active' && !todo.completed) || 
      (filter === 'completed' && todo.completed);
    
    const matchesSearch = todo.text.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  const stats = {
    total: todos.length,
    active: todos.filter(t => !t.completed).length,
    completed: todos.filter(t => t.completed).length
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 animate-slide-up">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent mb-4 animate-glow">
            CYPHER TASKS
          </h1>
          <p className="text-xl text-muted-foreground">
            Advanced Task Management System v2.0
          </p>
        </div>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="glass rounded-xl p-6 text-center">
            <div className="text-3xl font-bold text-primary">{stats.total}</div>
            <div className="text-muted-foreground">Total Tasks</div>
          </div>
          <div className="glass rounded-xl p-6 text-center">
            <div className="text-3xl font-bold text-accent">{stats.active}</div>
            <div className="text-muted-foreground">Active</div>
          </div>
          <div className="glass rounded-xl p-6 text-center">
            <div className="text-3xl font-bold text-secondary">{stats.completed}</div>
            <div className="text-muted-foreground">Completed</div>
          </div>
        </div>

        {/* Input Section */}
        <div className="glass rounded-2xl p-6 mb-8">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addTodo()}
                  placeholder="Initialize new task..."
                  className="input-cyber text-lg pl-12"
                />
                <Plus className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
              </div>
              <Button 
                onClick={addTodo}
                className="btn-cyber min-w-[140px] h-12"
              >
                <Plus className="w-5 h-5 mr-2" />
                ADD TASK
              </Button>
            </div>
            
            {/* Due Date/Time Section */}
            <div className="flex flex-col md:flex-row gap-4">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="justify-start text-left font-normal glass border-primary/30"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "Set due date (optional)"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 glass border-primary/30" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => isBefore(date, new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              
              {selectedDate && (
                <div className="relative">
                  <Input
                    type="time"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="input-cyber pl-10"
                    placeholder="Set time"
                  />
                  <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                </div>
              )}
              
              {(selectedDate || selectedTime) && (
                <Button
                  onClick={() => {
                    setSelectedDate(undefined);
                    setSelectedTime('');
                  }}
                  variant="outline"
                  size="sm"
                  className="glass border-primary/30"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="glass rounded-2xl p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search tasks..."
                className="input-cyber pl-12"
              />
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
            </div>
            <div className="flex gap-2">
              {(['all', 'active', 'completed'] as FilterType[]).map((filterType) => (
                <Button
                  key={filterType}
                  onClick={() => setFilter(filterType)}
                  variant={filter === filterType ? "default" : "outline"}
                  className={`capitalize ${filter === filterType ? 'glow-primary' : ''}`}
                >
                  <Filter className="w-4 h-4 mr-2" />
                  {filterType}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Tasks List */}
        <div className="space-y-4">
          {filteredTodos.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <div className="text-6xl mb-4 opacity-50">🌌</div>
              <h3 className="text-xl font-semibold text-muted-foreground mb-2">
                {searchTerm ? 'No tasks found' : 'No tasks in the system'}
              </h3>
              <p className="text-muted-foreground">
                {searchTerm ? 'Try adjusting your search terms' : 'Add your first task to get started'}
              </p>
            </div>
          ) : (
            filteredTodos.map((todo, index) => (
              <div
                key={todo.id}
                className="task-card animate-scale-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center gap-4">
                  <Button
                    onClick={() => toggleTodo(todo.id)}
                    variant="ghost"
                    size="sm"
                    className="p-1 hover:bg-transparent"
                  >
                    {todo.completed ? (
                      <CheckCircle2 className="w-6 h-6 text-accent glow-accent" />
                    ) : (
                      <Circle className="w-6 h-6 text-muted-foreground hover:text-primary transition-colors" />
                    )}
                  </Button>

                  <div className="flex-1">
                    {editingId === todo.id ? (
                      <div className="flex gap-2">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && saveEdit()}
                          className="input-cyber"
                          autoFocus
                        />
                        <Button
                          onClick={saveEdit}
                          size="sm"
                          className="bg-accent hover:bg-accent/90"
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={cancelEdit}
                          size="sm"
                          variant="outline"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <p 
                          className={`text-lg ${todo.completed ? 'line-through text-muted-foreground' : 'text-foreground'} transition-all duration-300`}
                          dangerouslySetInnerHTML={{ __html: todo.text }}
                        />
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
                          <span className="text-muted-foreground">
                            Created: {todo.createdAt.toLocaleDateString()} at {todo.createdAt.toLocaleTimeString()}
                          </span>
                          {todo.dueDate && (
                            <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                              isTaskOverdue(todo) 
                                ? 'bg-destructive/20 text-destructive animate-pulse' 
                                : isTaskDueSoon(todo)
                                ? 'bg-amber-500/20 text-amber-400 glow-amber'
                                : isTaskDueToday(todo)
                                ? 'bg-accent/20 text-accent'
                                : 'bg-primary/20 text-primary'
                            }`}>
                              {isTaskOverdue(todo) && <AlertCircle className="w-3 h-3" />}
                              <Clock className="w-3 h-3" />
                              Due: {format(todo.dueDate, 'MMM d, h:mm a')}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {editingId !== todo.id && (
                    <div className="flex gap-2">
                      <Button
                        onClick={() => startEditing(todo.id, todo.text)}
                        size="sm"
                        variant="outline"
                        className="hover:glow-primary"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => deleteTodo(todo.id)}
                        size="sm"
                        variant="destructive"
                        className="hover:glow-accent"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-muted-foreground">
          <p className="text-sm">
            Powered by Advanced Neural Networks • {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default TodoApp;