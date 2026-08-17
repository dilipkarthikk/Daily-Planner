import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import {
  getDb,
  getDashboardStats,
  getStudentsList,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  getAnalyticsData,
  resetDatabase,
  queryAll
} from './src/backend/db.js';
import { predictStudentPerformance } from './src/backend/mlEngine.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize SQL Database
  await getDb();

  // ==========================================
  // REST API ROUTES
  // ==========================================

  // 1. Healthcheck
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'Student Performance Analytics API', version: '1.0.0' });
  });

  // 2. Dashboard Overview Stats & Charts
  app.get('/api/dashboard', (req, res) => {
    try {
      const filters = {
        department: req.query.department as string,
        semester: req.query.semester as string,
        academic_year: req.query.academic_year as string,
        subject: req.query.subject as string,
        gender: req.query.gender as string,
      };
      const stats = getDashboardStats(filters);
      res.json(stats);
    } catch (err: any) {
      console.error('Error fetching dashboard stats:', err);
      res.status(500).json({ error: 'Failed to fetch dashboard statistics', message: err.message });
    }
  });

  // 3. Students Directory List
  app.get('/api/students', (req, res) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 10;
      const sortBy = (req.query.sortBy as string) || 'avg_marks';
      const sortOrder = ((req.query.sortOrder as string) || 'desc') as 'asc' | 'desc';

      const filters = {
        department: req.query.department as string,
        semester: req.query.semester as string,
        academic_year: req.query.academic_year as string,
        subject: req.query.subject as string,
        gender: req.query.gender as string,
        search: req.query.search as string,
      };

      const result = getStudentsList(filters, page, limit, sortBy, sortOrder);
      res.json(result);
    } catch (err: any) {
      console.error('Error fetching students list:', err);
      res.status(500).json({ error: 'Failed to fetch students list', message: err.message });
    }
  });

  // 4. Single Student Detail Profile
  app.get('/api/students/:id', (req, res) => {
    try {
      const studentId = req.params.id;
      const detail = getStudentById(studentId);
      if (!detail) {
        return res.status(404).json({ error: 'Student not found', student_id: studentId });
      }
      res.json(detail);
    } catch (err: any) {
      console.error('Error fetching student profile:', err);
      res.status(500).json({ error: 'Failed to fetch student profile', message: err.message });
    }
  });

  // 5. Create Student
  app.post('/api/students', (req, res) => {
    try {
      const { student_id, name, email, department_id, semester, academic_year, gender, subject_marks } = req.body;

      if (!student_id || !name || !email || !department_id || !semester) {
        return res.status(400).json({ error: 'Missing required student fields (student_id, name, email, department_id, semester)' });
      }

      const created = createStudent({
        student_id,
        name,
        email,
        department_id: Number(department_id),
        semester: Number(semester),
        academic_year: academic_year || '2024-2025',
        gender: gender || 'Female',
        subject_marks,
      });

      res.status(201).json(created);
    } catch (err: any) {
      console.error('Error creating student:', err);
      res.status(500).json({ error: 'Failed to create student record', message: err.message });
    }
  });

  // 6. Update Student
  app.put('/api/students/:id', (req, res) => {
    try {
      const studentId = req.params.id;
      const updated = updateStudent(studentId, req.body);
      res.json(updated);
    } catch (err: any) {
      console.error('Error updating student:', err);
      res.status(500).json({ error: 'Failed to update student', message: err.message });
    }
  });

  // 7. Delete Student
  app.delete('/api/students/:id', (req, res) => {
    try {
      const studentId = req.params.id;
      const result = deleteStudent(studentId);
      res.json(result);
    } catch (err: any) {
      console.error('Error deleting student:', err);
      res.status(500).json({ error: 'Failed to delete student', message: err.message });
    }
  });

  // 8. Performance Records
  app.get('/api/performance', (req, res) => {
    try {
      const subject = req.query.subject as string;
      let sql = 'SELECT * FROM performance';
      const params: any[] = [];
      if (subject && subject !== 'All') {
        sql += ' WHERE subject = ?';
        params.push(subject);
      }
      sql += ' ORDER BY performance_id DESC LIMIT 200';
      const records = queryAll(sql, params);
      res.json({ count: records.length, records });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch performance records', message: err.message });
    }
  });

  // 9. Analytics Page Data
  app.get('/api/analytics', (req, res) => {
    try {
      const filters = {
        department: req.query.department as string,
        semester: req.query.semester as string,
        academic_year: req.query.academic_year as string,
        subject: req.query.subject as string,
        gender: req.query.gender as string,
      };
      const analytics = getAnalyticsData(filters);
      res.json(analytics);
    } catch (err: any) {
      console.error('Error fetching analytics:', err);
      res.status(500).json({ error: 'Failed to fetch analytics data', message: err.message });
    }
  });

  // 10. Machine Learning Prediction Endpoint
  app.post('/api/predict', (req, res) => {
    try {
      const { attendance, study_hours, assignment_score, internal_marks, subject } = req.body;
      const prediction = predictStudentPerformance({
        attendance: Number(attendance) || 75,
        study_hours: Number(study_hours) || 10,
        assignment_score: Number(assignment_score) || 80,
        internal_marks: Number(internal_marks) || 75,
        subject,
      });
      res.json(prediction);
    } catch (err: any) {
      console.error('Error running ML prediction:', err);
      res.status(500).json({ error: 'Failed to process ML prediction', message: err.message });
    }
  });

  // 11. Database Reset / Re-seed
  app.post('/api/reset-data', (req, res) => {
    try {
      const result = resetDatabase();
      res.json(result);
    } catch (err: any) {
      console.error('Error resetting database:', err);
      res.status(500).json({ error: 'Failed to reset database', message: err.message });
    }
  });

  // 12. SQL Schema Document for Showcase
  app.get('/api/schema', (req, res) => {
    try {
      const schemaPath = path.join(process.cwd(), 'sql', 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const content = fs.readFileSync(schemaPath, 'utf-8');
        res.json({ schema: content });
      } else {
        res.status(404).json({ error: 'Schema file not found' });
      }
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to read schema file', message: err.message });
    }
  });

  // ==========================================
  // VITE & STATIC FILES
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
