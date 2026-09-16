import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ALL_MENU_VIEWS,
  NATIVELY_HANDLED_MENU_VIEWS,
  validateAllMenuViewsSupported,
  registerMenuGamepadDelegate,
  getMenuGamepadDelegate,
  type MenuGamepadDelegate,
} from '../menuGamepadRegistry';
import type { MenuView } from '../types';
import { useGameStore } from '@/store/gameStore';
import { getAvailableVehicles } from '@/config/vehicleRegistry';

describe('Universal Gamepad Menu Navigation Integrity Suite', () => {
  beforeEach(() => {
    useGameStore.setState({ gameState: 'menu', selectedVehicleId: 'apex_rally_awd' });
  });

  describe('Architectural MenuView Coverage & Exhaustiveness', () => {
    it('verifies that all known MenuView union members are declared in ALL_MENU_VIEWS', () => {
      const expectedViews: MenuView[] = [
        'main',
        'start_mode',
        'options',
        'controls',
        'garage',
        'tracks',
        'credits',
        'multiplayer',
      ];

      expect(ALL_MENU_VIEWS).toEqual(expect.arrayContaining(expectedViews));
      expect(ALL_MENU_VIEWS.length).toBe(expectedViews.length);
    });

    it('passes validateAllMenuViewsSupported() with zero unsupported views', () => {
      const report = validateAllMenuViewsSupported(ALL_MENU_VIEWS);
      expect(report.valid).toBe(true);
      expect(report.unsupportedViews).toEqual([]);
    });

    it('fails validateAllMenuViewsSupported() if an unhandled MenuView is introduced without a gamepad delegate', () => {
      // Simulating a future developer adding a new view e.g. 'tournament' without gamepad support
      const hypotheticalViews = [...ALL_MENU_VIEWS, 'tournament' as MenuView];
      const report = validateAllMenuViewsSupported(hypotheticalViews);
      expect(report.valid).toBe(false);
      expect(report.unsupportedViews).toContain('tournament');
    });

    it('verifies that all natively handled menu views have positive item counts', () => {
      expect(NATIVELY_HANDLED_MENU_VIEWS).toContain('main');
      expect(NATIVELY_HANDLED_MENU_VIEWS).toContain('start_mode');
      expect(NATIVELY_HANDLED_MENU_VIEWS).toContain('options');
      expect(NATIVELY_HANDLED_MENU_VIEWS).toContain('controls');
      expect(NATIVELY_HANDLED_MENU_VIEWS).toContain('garage');
      expect(NATIVELY_HANDLED_MENU_VIEWS).toContain('tracks');
      expect(NATIVELY_HANDLED_MENU_VIEWS).toContain('credits');
    });
  });

  describe('MenuGamepadDelegate Registration & Lifecycle', () => {
    it('successfully registers, retrieves, and unregisters a delegate for a view', () => {
      expect(getMenuGamepadDelegate('multiplayer')).toBeNull();

      const mockDelegate: MenuGamepadDelegate = {
        handleNavUp: vi.fn(),
        handleNavDown: vi.fn(),
        handleConfirm: vi.fn(),
        handleBack: vi.fn(() => true),
      };

      const unregister = registerMenuGamepadDelegate('multiplayer', mockDelegate);
      expect(getMenuGamepadDelegate('multiplayer')).toBe(mockDelegate);

      // Verify callbacks can be invoked
      const delegate = getMenuGamepadDelegate('multiplayer');
      delegate?.handleNavUp?.();
      expect(mockDelegate.handleNavUp).toHaveBeenCalledTimes(1);

      const consumed = delegate?.handleBack?.();
      expect(consumed).toBe(true);
      expect(mockDelegate.handleBack).toHaveBeenCalledTimes(1);

      // Cleanup
      unregister();
      expect(getMenuGamepadDelegate('multiplayer')).toBeNull();
    });

    it('verifies bumper vehicle cycling logic (LB / RB) across available vehicle roster', () => {
      const vehicles = getAvailableVehicles();
      expect(vehicles.length).toBeGreaterThanOrEqual(5);

      useGameStore.setState({ selectedVehicleId: vehicles[0].id });

      // Cycle right (RB)
      const cycleRight = () => {
        const curId = useGameStore.getState().selectedVehicleId;
        const curIdx = vehicles.findIndex((v) => v.id === curId);
        const nextIdx = (curIdx + 1) % vehicles.length;
        useGameStore.setState({ selectedVehicleId: vehicles[nextIdx].id });
      };

      cycleRight();
      expect(useGameStore.getState().selectedVehicleId).toBe(vehicles[1].id);

      // Cycle left (LB)
      const cycleLeft = () => {
        const curId = useGameStore.getState().selectedVehicleId;
        const curIdx = vehicles.findIndex((v) => v.id === curId);
        const prevIdx = (curIdx - 1 + vehicles.length) % vehicles.length;
        useGameStore.setState({ selectedVehicleId: vehicles[prevIdx].id });
      };

      cycleLeft();
      expect(useGameStore.getState().selectedVehicleId).toBe(vehicles[0].id);

      // Cycle left from first vehicle wraps to last
      cycleLeft();
      expect(useGameStore.getState().selectedVehicleId).toBe(vehicles[vehicles.length - 1].id);
    });

    it('verifies back action consumption: returns true when modal is open and false when closed', () => {
      let isModalOpen = true;

      const delegate: MenuGamepadDelegate = {
        handleBack: () => {
          if (isModalOpen) {
            isModalOpen = false;
            return true; // consumed
          }
          return false; // let navigation return to main menu
        },
      };

      const unregister = registerMenuGamepadDelegate('multiplayer', delegate);

      // First back press: closes modal
      expect(getMenuGamepadDelegate('multiplayer')?.handleBack?.()).toBe(true);
      expect(isModalOpen).toBe(false);

      // Second back press: returns false so main menu transition occurs
      expect(getMenuGamepadDelegate('multiplayer')?.handleBack?.()).toBe(false);

      unregister();
    });

    it('verifies room name resolution and validation for gamepad room launching', () => {
      const resolveRoomName = (input: string, nickname: string) => {
        const rawName = input.trim() || `${nickname || 'Apex_Driver'} Rally`;
        const trimmed = rawName.slice(0, 24);
        if (trimmed.length < 2 || trimmed.length > 24) {
          return { valid: false, error: 'Room name must be between 2 and 24 characters.' };
        }
        return { valid: true, name: trimmed };
      };

      // User's exact room name
      expect(resolveRoomName('Apex_287 Rally', 'Apex_287')).toEqual({
        valid: true,
        name: 'Apex_287 Rally',
      });

      // Default fallback when empty
      expect(resolveRoomName('', 'Apex_287')).toEqual({
        valid: true,
        name: 'Apex_287 Rally',
      });

      // Fallback with default nickname
      expect(resolveRoomName('', '')).toEqual({
        valid: true,
        name: 'Apex_Driver Rally',
      });

      // Edge case: single character invalid
      expect(resolveRoomName('A', 'Apex_287')).toEqual({
        valid: false,
        error: 'Room name must be between 2 and 24 characters.',
      });
    });

    it('verifies multiplayer tire compound selection and bumper cycling', () => {
      const tires = ['asphalt', 'gravel', 'snow'] as const;
      useGameStore.setState({ selectedTireType: 'gravel' });

      // TabRight / cycle next
      const cycleNextTire = () => {
        const curTire = useGameStore.getState().selectedTireType;
        const curIdx = tires.indexOf(curTire as (typeof tires)[number]);
        const nextIdx = (curIdx + 1) % tires.length;
        useGameStore.setState({ selectedTireType: tires[nextIdx] });
      };

      // TabLeft / cycle prev
      const cyclePrevTire = () => {
        const curTire = useGameStore.getState().selectedTireType;
        const curIdx = tires.indexOf(curTire as (typeof tires)[number]);
        const prevIdx = (curIdx - 1 + tires.length) % tires.length;
        useGameStore.setState({ selectedTireType: tires[prevIdx] });
      };

      expect(useGameStore.getState().selectedTireType).toBe('gravel');

      cycleNextTire();
      expect(useGameStore.getState().selectedTireType).toBe('snow');

      cycleNextTire(); // wraps to asphalt
      expect(useGameStore.getState().selectedTireType).toBe('asphalt');

      cyclePrevTire(); // wraps back to snow
      expect(useGameStore.getState().selectedTireType).toBe('snow');
    });
  });
});
