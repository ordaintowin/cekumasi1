import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import membersRouter from "./members";
import fellowshipsRouter from "./fellowships";
import departmentsRouter from "./departments";
import childrenRouter from "./children";
import familiesRouter from "./families";
import attendanceRouter from "./attendance";
import financeRouter from "./finance";
import archivesRouter from "./archives";
import adminRouter from "./admin";
import dashboardRouter from "./dashboard";
import onlineRouter from "./online";
import conferenceRouter from "./conference";

import homeRouter from "./home";
import announcementsRouter from "./announcements";
import prayerRequestsRouter from "./prayer-requests";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/conference", conferenceRouter);
router.use("/members", membersRouter);

// Fellowship hierarchy: /cells, /senior-cells, /pcfs, /fellowships
router.use("/", fellowshipsRouter);

router.use("/departments", departmentsRouter);

// /children, /teens
router.use("/", childrenRouter);

router.use("/families", familiesRouter);

// /services, /first-timers, /reports
router.use("/", attendanceRouter);

// /ministry-years, /giving-types, /givings, /reports/finance
router.use("/", financeRouter);

router.use("/archives", archivesRouter);
router.use("/admin", adminRouter);
router.use("/dashboard", dashboardRouter);
router.use("/", onlineRouter);

router.use("/", homeRouter);
router.use("/announcements", announcementsRouter);
router.use("/prayer-requests", prayerRequestsRouter);

export default router;
