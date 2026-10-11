import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { INITIAL_CATEGORIES } from "../client/src/lib/mock-data";
import { invalidateActiveUsersCache, registerTelegramWebhookRoute } from "./services/telegram-bot-service";

export function registerRoutes(
  httpServer: Server,
  app: Express
): Server {
  registerTelegramWebhookRoute(app);
  
  // Seed Defaults Asynchronously
  (async () => {
    try {
      // Only seed if database has ZERO users (prevents re-seeding after admin deletion)
      const allUsers = await storage.getUsers();
      if (allUsers.length === 0) {
        await storage.createUser({
          username: "Admin",
          name: "Admin",
          role: "admin",
          password: "Admin123",
          avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Admin"
        });
        console.log("Default Admin user successfully created.");
        const { categories } = await storage.getAppState();
        if (categories.length === 0) {
          for (const cat of INITIAL_CATEGORIES) {
            await storage.createCategory({ name: cat.name, isDefault: cat.isDefault });
          }
        }
      }

      // Seed default schedule categories if empty
      try {
        const schedCats = await storage.getScheduleCategories();
        if (schedCats.length === 0) {
          const DEFAULT_SCHEDULE_CATEGORIES = [
            "Room Cleaning",
            "Vessel Cleaning",
            "Grocery",
            "Bill Payment",
            "Maintenance",
            "Other",
          ];
          for (const catName of DEFAULT_SCHEDULE_CATEGORIES) {
            await storage.createScheduleCategory({ name: catName, isDefault: true });
          }
          console.log("Default schedule categories created.");
        }
      } catch (catErr) {
        console.warn("Schedule categories table may not exist yet:", catErr);
      }
    } catch (error) {
      console.error("Failed to seed default Admin user:", error);
    }
  })();

  // --- API ROUTES ---

  app.get("/api/state", async (req: Request, res: Response) => {
    try {
      const state = await storage.getAppState();
      res.json(state);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("Failed to load state:", errorMsg);
      res.status(500).json({ error: "Failed to load state", details: errorMsg });
    }
  });

  // Users
  app.get("/api/users", async (_req, res) => {
    try {
      const allUsers = await storage.getUsers();
      res.json(allUsers);
    } catch (e) {
      res.status(500).json({ error: "Failed" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const user = await storage.createUser(req.body);
      res.json(user);
    } catch (e) { res.status(500).json({ error: "Failed" }); }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      await storage.deleteUser(req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed" }); }
  });

  app.put("/api/users/:id/password", async (req, res) => {
    try {
      await storage.updateUserPassword(req.params.id, req.body.password);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/active-users", async (req, res) => {
    try {
      const month = String(req.query.month || "");
      if (!month) {
        res.status(400).json({ error: "month query param is required (YYYY-MM)" });
        return;
      }

      const allUsers = await storage.getUsers();
      let activeUsers: Awaited<ReturnType<typeof storage.getActiveUsers>> = [];
      try {
        activeUsers = await storage.getActiveUsers(month);
      } catch (error) {
        console.error("Failed to read active users for month, defaulting to all users:", error);
      }
      const effective = activeUsers.length > 0 ? activeUsers : allUsers;

      res.json({
        month,
        userIds: effective.map((u) => u.id),
        users: effective,
        source: activeUsers.length > 0 ? "custom" : "default-all",
      });
    } catch (e) {
      res.status(500).json({ error: "Failed" });
    }
  });

  app.post("/api/active-users", async (req, res) => {
    try {
      const month = String(req.body?.month || "");
      const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds.map(String) : [];

      if (!month) {
        res.status(400).json({ error: "month is required" });
        return;
      }

      await storage.setActiveUsers(month, userIds);
      invalidateActiveUsersCache(month);
      res.json({ success: true, month, userIds });
    } catch (e) {
      res.status(500).json({ error: "Failed" });
    }
  });

  // Expenses
  app.post("/api/expenses", async (req, res) => {
    try {
      const e = await storage.createExpense(req.body);
      res.json(e);
    } catch (e) { res.status(500).json({ error: "Failed" }); }
  });

  app.put("/api/expenses/:id", async (req, res) => {
    try {
      const e = await storage.updateExpense(req.params.id, req.body);
      res.json(e);
    } catch (e) { res.status(500).json({ error: "Failed" }); }
  });

  app.delete("/api/expenses/:id", async (req, res) => {
    try {
      await storage.deleteExpense(req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed" }); }
  });

  // Categories
  app.post("/api/categories", async (req, res) => {
    try {
      const c = await storage.createCategory(req.body);
      res.json(c);
    } catch (e) { res.status(500).json({ error: "Failed" }); }
  });

  app.delete("/api/categories/:id", async (req, res) => {
    try {
      await storage.deleteCategory(req.params.id);
      res.json({ success: true });
    } catch (e: any) { res.status(409).json({ error: e.message || "Failed" }); }
  });

  // Month
  app.post("/api/months", async (req, res) => {
    try {
      const { month, isLocked } = req.body;
      const m = await storage.upsertMonthStatus(month, isLocked);
      res.json(m);
    } catch (e) { res.status(500).json({ error: "Failed" }); }
  });

  // Unlock month
  app.delete("/api/months/:month", async (req, res) => {
    try {
      const m = await storage.upsertMonthStatus(req.params.month, false);
      res.json(m);
    } catch (e) { res.status(500).json({ error: "Failed" }); }
  });

  // Delete month completely
  app.delete("/api/months/:month/delete", async (req, res) => {
    try {
      await storage.deleteMonth(req.params.month);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message || "Failed to delete month" }); }
  });

  // Settlements
  app.post("/api/settlements", async (req, res) => {
    try {
      const s = await storage.createSettlement(req.body);
      res.json(s);
    } catch (e) { res.status(500).json({ error: "Failed" }); }
  });

  app.put("/api/settlements/:id", async (req, res) => {
    try {
      const s = await storage.updateSettlementStatus(req.params.id, req.body.status);
      res.json(s);
    } catch (e) { res.status(500).json({ error: "Failed" }); }
  });

  // Cleaning Attendance
  app.post("/api/cleaning-attendance", async (req, res) => {
    try {
      console.log("POST /api/cleaning-attendance - Request body:", JSON.stringify(req.body, null, 2));
      const attendance = await storage.createCleaningAttendance(req.body);
      console.log("Attendance created successfully:", attendance);
      res.json(attendance);
    } catch (e) { 
      const errorMsg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : '';
      console.error("Failed to create attendance:");
      console.error("Error:", errorMsg);
      console.error("Stack:", stack);
      console.error("Request body:", JSON.stringify(req.body, null, 2));
      
      let details = errorMsg;
      if (errorMsg.includes('does not exist') || errorMsg.includes('cleaning_attendance')) {
        details = "Database table not found. Run 'npm run db:push' to create the database schema.";
      } else if (errorMsg.includes('column') || errorMsg.includes('Column')) {
        details = "Database column error: " + errorMsg;
      }
      
      res.status(500).json({ error: "Failed to create attendance", details }); 
    }
  });

  app.get("/api/cleaning-attendance", async (req, res) => {
    try {
      const month = String(req.query.month || "");
      let records;
      if (month) {
        records = await storage.getCleaningAttendanceByMonth(month);
      } else {
        // If no month specified, get all
        const state = await storage.getAppState();
        records = state.cleaningAttendance;
      }
      res.json(records);
    } catch (e) { res.status(500).json({ error: "Failed to fetch attendance" }); }
  });

  app.get("/api/cleaning-attendance/:id", async (req, res) => {
    try {
      const record = await storage.getCleaningAttendance(req.params.id);
      if (!record) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(record);
    } catch (e) { res.status(500).json({ error: "Failed" }); }
  });

  app.put("/api/cleaning-attendance/:id", async (req, res) => {
    try {
      const { status, approvedBy } = req.body;
      const updated = await storage.updateCleaningAttendanceStatus(req.params.id, status, approvedBy);
      res.json(updated);
    } catch (e) { res.status(500).json({ error: "Failed to update attendance" }); }
  });

  // Schedules
  app.get("/api/schedules", async (req: Request, res: Response) => {
    try {
      const month = req.query.month ? String(req.query.month) : undefined;
      const list = await storage.getSchedules(month);
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to fetch schedules" });
    }
  });

  app.get("/api/schedules/:id", async (req: Request, res: Response) => {
    try {
      const item = await storage.getSchedule(String(req.params.id));
      if (!item) return res.status(404).json({ error: "Schedule not found" });
      res.json(item);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to fetch schedule" });
    }
  });

  app.post("/api/schedules", async (req: Request, res: Response) => {
    try {
      const created = await storage.createSchedule({
        ...req.body,
        createdAt: new Date().toISOString(),
      });
      res.json(created);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to create schedule" });
    }
  });

  app.put("/api/schedules/:id", async (req: Request, res: Response) => {
    try {
      const updated = await storage.updateSchedule(String(req.params.id), req.body);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to update schedule" });
    }
  });

  app.delete("/api/schedules/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteSchedule(String(req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to delete schedule" });
    }
  });

  // Schedule Categories
  app.get("/api/schedule-categories", async (_req: Request, res: Response) => {
    try {
      const list = await storage.getScheduleCategories();
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to fetch schedule categories" });
    }
  });

  app.post("/api/schedule-categories", async (req: Request, res: Response) => {
    try {
      const created = await storage.createScheduleCategory(req.body);
      res.json(created);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to create schedule category" });
    }
  });

  app.delete("/api/schedule-categories/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteScheduleCategory(String(req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to delete schedule category" });
    }
  });

  // Telegram status and webhook management
  app.get("/api/telegram/status", async (_req: Request, res: Response) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return res.json({ configured: false, error: "TELEGRAM_BOT_TOKEN not configured" });
    }
    try {
      const [meRes, webhookRes] = await Promise.all([
        fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json()),
        fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) => r.json()),
      ]);
      res.json({
        configured: true,
        bot: meRes.result,
        webhook: webhookRes.result,
        useWebhook: process.env.TELEGRAM_USE_WEBHOOK === "true" || Boolean(process.env.VERCEL),
        envWebhookUrl: process.env.TELEGRAM_WEBHOOK_URL || null,
      });
    } catch (err: any) {
      res.status(500).json({ configured: true, error: err.message });
    }
  });

  app.post("/api/telegram/setup-webhook", async (req: Request, res: Response) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return res.status(400).json({ error: "TELEGRAM_BOT_TOKEN not set" });
    const targetUrl = req.body?.webhookUrl || process.env.TELEGRAM_WEBHOOK_URL;
    if (!targetUrl) {
      return res.status(400).json({ error: "Missing webhookUrl in body or TELEGRAM_WEBHOOK_URL in environment" });
    }
    const cleanUrl = String(targetUrl).replace(/\/+$/, "");
    const webhookEndpoint = `${cleanUrl}/api/telegram/webhook`;
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookEndpoint)}`).then((r) => r.json());
      res.json({ success: tgRes.ok, result: tgRes, webhookEndpoint });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/telegram/delete-webhook", async (_req: Request, res: Response) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return res.status(400).json({ error: "TELEGRAM_BOT_TOKEN not set" });
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`).then((r) => r.json());
      res.json({ success: tgRes.ok, result: tgRes });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
