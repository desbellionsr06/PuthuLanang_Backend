import { Router } from 'express';
import { getMenu, createMenu, updateMenu, deleteMenu } from '../controllers/menuController';

const router = Router();

// Menu Endpoints
router.get('/', getMenu);
router.post('/', createMenu);
router.put('/:id', updateMenu);
router.delete('/:id', deleteMenu);

export default router;
