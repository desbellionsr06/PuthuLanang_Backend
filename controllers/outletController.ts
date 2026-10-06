import { Request, Response } from 'express';

export const getOutletStatus = (req: Request, res: Response) => {
  return res.status(200).json({
    outletName: 'Puthu Lanang Celaket Malang',
    address: 'Jl. Jaksa Agung Suprapto No. 73, Samaan, Klojen, Malang',
    isOpen: true,
    openingHours: '17:30 - 21:30 WIB',
    kitchenStatus: 'Bara Dapur Aktif - Pengukusan Bambu Clungup',
    estimatedWaitMins: 15,
    activeQueueCount: 12,
    dailyQuotaTotal: 500,
    dailyQuotaRemaining: 85,
    availablePickupSlots: [
      { slot: '16:00 - 16:30 WIB', available: true, slotsLeft: 8 },
      { slot: '16:30 - 17:00 WIB', available: true, slotsLeft: 12 },
      { slot: '17:00 - 17:30 WIB', available: true, slotsLeft: 5 },
      { slot: '17:30 - 18:00 WIB', available: true, slotsLeft: 15 },
      { slot: '18:00 - 18:30 WIB', available: true, slotsLeft: 10 },
      { slot: '18:30 - 19:00 WIB', available: true, slotsLeft: 14 },
      { slot: '19:00 - 19:30 WIB', available: true, slotsLeft: 20 },
      { slot: '19:30 - 20:00 WIB', available: true, slotsLeft: 18 },
    ],
    timestamp: new Date().toISOString(),
  });
};
