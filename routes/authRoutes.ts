import { Router } from 'express';
import { adminLogin, userLogin, userRegister } from '../controllers/authController';

const router = Router();

// Auth Endpoints
router.post('/admin-login', adminLogin);
router.post('/user-login', userLogin);
router.post('/user-register', userRegister);

export default router;
