import { useState, useEffect, useRef, useCallback } from 'react';
import { menuStyles, getFocusStyle } from './menuStyles';
import type { MenuView } from './types';
import {
  useMultiplayerStore,
  CURATED_RACER_ADJECTIVES,
  CURATED_RACER_MASCOTS,
  generateCuratedNickname,
} from '@/store/multiplayerStore';
import { useGameStore } from '@/store/gameStore';
import { useRacingStore } from '@/store/racingStore';
import { useGymkhanaStore } from '@/store/gymkhanaStore';
import { useTagStore } from '@/store/tagStore';
import { networkClient } from '@/network/networkClient';
import { getAvailableVehicles, getVehiclePreset } from '@/config/vehicleRegistry';
import { getAvailableLevels, getLevelPreset } from '@/config/levelRegistry';
import { AVAILABLE_TIRE_TYPES, getTireDefinition } from '@/config/tireRegistry';
import { unlockSharedAudioContext } from '@/utils/audio/audioContext';
import { registerMenuGamepadDelegate } from './menuGamepadRegistry';
import { GAME_VERSION } from '@/config/version';
import type { RoomSummary } from '@/types/network';
import type { GameMode } from '@/types/game';

function generateCuratedRoomTitle(): string {
  const adj = CURATED_RACER_ADJECTIVES[Math.floor(Math.random() * CURATED_RACER_ADJECTIVES.length)];
  const masc = CURATED_RACER_MASCOTS[Math.floor(Math.random() * CURATED_RACER_MASCOTS.length)];
  const num = Math.floor(10 + Math.random() * 89);
  return `${adj} ${masc} ${num}`;
}

export type MultiplayerFocusTarget =
  | { area: 'vehicles'; index: number }
  | { area: 'tires'; index: number }
  | { area: 'reroll_identity' }
  | { area: 'refresh' }
  | { area: 'create_toggle' }
  | { area: 'modal_reroll_room' }
  | { area: 'modal_track'; index: number }
  | { area: 'modal_mode'; index: number }
  | { area: 'modal_launch' }
  | { area: 'room_join'; index: number }
  | { area: 'room_delete'; index: number }
  | { area: 'quick_play' }
  | { area: 'back' };

interface MultiplayerViewProps {
  focusedIndex: number;
  textColor: string;
  onPointerMoveItem: (index: number, e: React.PointerEvent) => void;
  onSelectView: (view: MenuView) => void;
}

function getGamepadFocusStyle(isFocused: boolean): React.CSSProperties {
  if (!isFocused) return {};
  return {
    outline: '2px solid #38BDF8',
    outlineOffset: '2px',
    boxShadow: '0 0 16px rgba(56, 189, 248, 0.85)',
    borderColor: '#38BDF8',
  };
}

export function MultiplayerView({
  focusedIndex,
  textColor,
  onPointerMoveItem,
  onSelectView,
}: MultiplayerViewProps) {
  const nickname = useMultiplayerStore((s) => s.nickname);
  const setNickname = useMultiplayerStore((s) => s.setNickname);
  const status = useMultiplayerStore((s) => s.status);
  const ping = useMultiplayerStore((s) => s.ping);
  const rooms = useMultiplayerStore((s) => s.rooms);
  const selfId = useMultiplayerStore((s) => s.selfId);
  const error = useMultiplayerStore((s) => s.error);
  const versionMismatch = useMultiplayerStore((s) => s.versionMismatch);
  const isVersionMismatch = status === 'version_mismatch' || versionMismatch !== null;

  const selectedVehicleId = useGameStore((s) => s.selectedVehicleId);
  const setSelectedVehicleId = useGameStore((s) => s.setSelectedVehicleId);
  const selectedTireType = useGameStore((s) => s.selectedTireType);
  const setSelectedTireType = useGameStore((s) => s.setSelectedTireType);
  const setSelectedLevelId = useGameStore((s) => s.setSelectedLevelId);
  const setGameMode = useGameStore((s) => s.setGameMode);
  const setGameState = useGameStore((s) => s.setGameState);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [curatedRoomTitle, setCuratedRoomTitle] = useState(() => generateCuratedRoomTitle());
  const [createLevelId, setCreateLevelId] = useState('level1_island');
  const [createGameMode, setCreateGameMode] = useState<GameMode>('timeattack');
  const [createError, setCreateError] = useState<string | null>(null);

  // Available roster of vehicles and registered levels
  const vehicles = getAvailableVehicles();
  const levels = getAvailableLevels();

  // Focus management for Gamepad / Keyboard navigation
  const [focusTarget, setFocusTarget] = useState<MultiplayerFocusTarget>(() => {
    if (focusedIndex === 1) return { area: 'back' };
    return { area: 'quick_play' };
  });

  // Keep references to latest state to avoid recreation of delegate handlers
  const focusTargetRef = useRef<MultiplayerFocusTarget>(focusTarget);
  focusTargetRef.current = focusTarget;
  const showCreateModalRef = useRef(showCreateModal);
  showCreateModalRef.current = showCreateModal;
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const isVersionMismatchRef = useRef(isVersionMismatch);
  isVersionMismatchRef.current = isVersionMismatch;
  const vehiclesRef = useRef(vehicles);
  vehiclesRef.current = vehicles;
  const levelsRef = useRef(levels);
  levelsRef.current = levels;
  const selectedVehicleIdRef = useRef(selectedVehicleId);
  selectedVehicleIdRef.current = selectedVehicleId;
  const selectedTireTypeRef = useRef(selectedTireType);
  selectedTireTypeRef.current = selectedTireType;
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;

  const curatedRoomTitleRef = useRef(curatedRoomTitle);
  curatedRoomTitleRef.current = curatedRoomTitle;
  const createLevelIdRef = useRef(createLevelId);
  createLevelIdRef.current = createLevelId;
  const createGameModeRef = useRef(createGameMode);
  createGameModeRef.current = createGameMode;

  const handleRerollNickname = useCallback(() => {
    const fresh = generateCuratedNickname();
    setNickname(fresh);
  }, [setNickname]);

  const handleRerollRoomTitle = useCallback(() => {
    const fresh = generateCuratedRoomTitle();
    setCuratedRoomTitle(fresh);
  }, []);

  const handleRerollNicknameRef = useRef(handleRerollNickname);
  handleRerollNicknameRef.current = handleRerollNickname;
  const handleRerollRoomTitleRef = useRef(handleRerollRoomTitle);
  handleRerollRoomTitleRef.current = handleRerollRoomTitle;

  const createPreset = getLevelPreset(createLevelId);
  const currentSupportedModes = createPreset.supportedModes ?? ['freeroam', 'timeattack'];
  const currentSupportedModesRef = useRef(currentSupportedModes);
  currentSupportedModesRef.current = currentSupportedModes;

  const isLaunchingRef = useRef(false);

  // Auto-scroll focused element into view
  useEffect(() => {
    const el = document.querySelector('[data-gamepad-focused="true"]');
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }, [focusTarget]);

  // Connect to relay server on view mount to fetch live rooms and subscribe
  useEffect(() => {
    networkClient.connect();
    networkClient.requestRooms();

    // Periodically refresh active rooms every 2.5s while browsing multiplayer menu
    const pollInterval = setInterval(() => {
      networkClient.requestRooms();
    }, 2500);

    return () => {
      clearInterval(pollInterval);
      const isEnteringGame =
        isLaunchingRef.current ||
        useGameStore.getState().gameState === 'playing' ||
        !!useMultiplayerStore.getState().currentRoom;

      if (!isEnteringGame) {
        networkClient.disconnect();
        useMultiplayerStore.getState().reset();
      }
    };
  }, []);

  const handleBackToMain = () => {
    networkClient.disconnect();
    useMultiplayerStore.getState().reset();
    onSelectView('main');
  };

  const getEffectiveNickname = () => {
    return useMultiplayerStore.getState().nickname || 'Apex_Driver';
  };

  const handleSelectCreateTrack = (lvlId: string) => {
    setCreateLevelId(lvlId);
    const preset = getLevelPreset(lvlId);
    const supported = preset.supportedModes ?? ['freeroam', 'timeattack'];
    if (!supported.includes(createGameModeRef.current)) {
      setCreateGameMode(supported[0]);
    }
  };

  const handleJoinRoom = (roomId: string, levelId: string, roomGameMode: GameMode) => {
    if (isVersionMismatch) return;
    isLaunchingRef.current = true;
    const finalNick = getEffectiveNickname();
    setNickname(finalNick);

    setSelectedLevelId(levelId);
    setGameMode(roomGameMode);

    useGameStore.getState().triggerReset(true);
    useRacingStore.getState().resetRace();
    useRacingStore.getState().syncBestLapForLevel(levelId);
    useGymkhanaStore.getState().resetBlitz();
    useGymkhanaStore.getState().syncBestScoreForLevel(levelId);
    useTagStore.getState().reset();

    if (roomGameMode === 'timeattack') {
      useRacingStore.getState().startCountdown();
    } else if (roomGameMode === 'gymkhana_blitz') {
      useGymkhanaStore.getState().startCountdown();
    }

    networkClient.joinRoom(roomId, finalNick, selectedVehicleIdRef.current);

    unlockSharedAudioContext().catch(() => {});
    setGameState('playing');
    onSelectView('main');
  };

  const executeCreateRoom = () => {
    if (isVersionMismatch) return;
    const trimmed = (curatedRoomTitleRef.current.trim() || 'Swift Fox 42').slice(0, 24);

    isLaunchingRef.current = true;
    const finalNick = getEffectiveNickname();
    setNickname(finalNick);

    const levelId = createLevelIdRef.current;
    const mode = createGameModeRef.current;
    const vehicleId = selectedVehicleIdRef.current;

    setSelectedLevelId(levelId);
    setGameMode(mode);

    useGameStore.getState().triggerReset(true);
    useRacingStore.getState().resetRace();
    useRacingStore.getState().syncBestLapForLevel(levelId);
    useGymkhanaStore.getState().resetBlitz();
    useGymkhanaStore.getState().syncBestScoreForLevel(levelId);
    useTagStore.getState().reset();

    if (mode === 'timeattack') {
      useRacingStore.getState().startCountdown();
    } else if (mode === 'gymkhana_blitz') {
      useGymkhanaStore.getState().startCountdown();
    }

    networkClient.createRoom(trimmed, finalNick, vehicleId, levelId, mode);

    unlockSharedAudioContext().catch(() => {});
    setGameState('playing');
    onSelectView('main');
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    executeCreateRoom();
  };

  const handleDeleteRoom = (room: RoomSummary) => {
    if (window.confirm(`Are you sure you want to delete room "${room.name}"?`)) {
      networkClient.deleteRoom(room.id);
    }
  };

  const executeCreateRoomRef = useRef(executeCreateRoom);
  executeCreateRoomRef.current = executeCreateRoom;
  const handleJoinRoomRef = useRef(handleJoinRoom);
  handleJoinRoomRef.current = handleJoinRoom;
  const handleDeleteRoomRef = useRef(handleDeleteRoom);
  handleDeleteRoomRef.current = handleDeleteRoom;
  const handleBackToMainRef = useRef(handleBackToMain);
  handleBackToMainRef.current = handleBackToMain;

  // Register Gamepad Delegate for MultiplayerView
  useEffect(() => {
    const unregister = registerMenuGamepadDelegate('multiplayer', {
      handleTabLeft: () => {
        if (focusTargetRef.current.area === 'tires') {
          const curTire = selectedTireTypeRef.current;
          const curIdx = AVAILABLE_TIRE_TYPES.indexOf(curTire);
          const prevIdx = (curIdx - 1 + AVAILABLE_TIRE_TYPES.length) % AVAILABLE_TIRE_TYPES.length;
          setSelectedTireType(AVAILABLE_TIRE_TYPES[prevIdx]);
          setFocusTarget({ area: 'tires', index: prevIdx });
        } else {
          const vList = vehiclesRef.current;
          const curId = selectedVehicleIdRef.current;
          const curIdx = vList.findIndex((v) => v.id === curId);
          const prevIdx = (curIdx - 1 + vList.length) % vList.length;
          setSelectedVehicleId(vList[prevIdx].id);
          if (focusTargetRef.current.area === 'vehicles') {
            setFocusTarget({ area: 'vehicles', index: prevIdx });
          }
        }
      },
      handleTabRight: () => {
        if (focusTargetRef.current.area === 'tires') {
          const curTire = selectedTireTypeRef.current;
          const curIdx = AVAILABLE_TIRE_TYPES.indexOf(curTire);
          const nextIdx = (curIdx + 1) % AVAILABLE_TIRE_TYPES.length;
          setSelectedTireType(AVAILABLE_TIRE_TYPES[nextIdx]);
          setFocusTarget({ area: 'tires', index: nextIdx });
        } else {
          const vList = vehiclesRef.current;
          const curId = selectedVehicleIdRef.current;
          const curIdx = vList.findIndex((v) => v.id === curId);
          const nextIdx = (curIdx + 1) % vList.length;
          setSelectedVehicleId(vList[nextIdx].id);
          if (focusTargetRef.current.area === 'vehicles') {
            setFocusTarget({ area: 'vehicles', index: nextIdx });
          }
        }
      },
      handleNavLeft: () => {
        const cur = focusTargetRef.current;
        const vList = vehiclesRef.current;
        if (cur.area === 'refresh' || cur.area === 'create_toggle') {
          setFocusTarget({ area: 'reroll_identity' });
        } else if (cur.area === 'reroll_identity') {
          setFocusTarget({ area: 'vehicles', index: 0 });
        } else if (cur.area === 'modal_reroll_room') {
          setFocusTarget({ area: 'vehicles', index: 0 });
        } else if (cur.area === 'modal_track') {
          if (cur.index > 0) setFocusTarget({ area: 'modal_track', index: cur.index - 1 });
          else setFocusTarget({ area: 'vehicles', index: 0 });
        } else if (cur.area === 'modal_mode') {
          if (cur.index > 0) setFocusTarget({ area: 'modal_mode', index: cur.index - 1 });
          else setFocusTarget({ area: 'vehicles', index: 0 });
        } else if (cur.area === 'modal_launch') {
          setFocusTarget({ area: 'vehicles', index: 0 });
        } else if (cur.area === 'room_delete') {
          setFocusTarget({ area: 'room_join', index: cur.index });
        } else if (cur.area === 'room_join') {
          setFocusTarget({ area: 'vehicles', index: Math.min(vList.length - 1, cur.index) });
        } else if (cur.area === 'tires') {
          if (cur.index > 0) setFocusTarget({ area: 'tires', index: cur.index - 1 });
          else setFocusTarget({ area: 'vehicles', index: vList.length - 1 });
        } else if (cur.area === 'quick_play' || cur.area === 'back') {
          setFocusTarget({ area: 'tires', index: 0 });
        }
      },
      handleNavRight: () => {
        const cur = focusTargetRef.current;
        const rList = roomsRef.current;
        const curUserId = selfIdRef.current;
        if (cur.area === 'vehicles') {
          if (showCreateModalRef.current) {
            setFocusTarget({ area: 'modal_reroll_room' });
          } else if (rList.length > 0) {
            setFocusTarget({ area: 'room_join', index: Math.min(rList.length - 1, cur.index) });
          } else {
            setFocusTarget({ area: 'create_toggle' });
          }
        } else if (cur.area === 'tires') {
          if (cur.index < AVAILABLE_TIRE_TYPES.length - 1) {
            setFocusTarget({ area: 'tires', index: cur.index + 1 });
          } else {
            setFocusTarget({ area: 'reroll_identity' });
          }
        } else if (cur.area === 'reroll_identity') {
          if (showCreateModalRef.current) {
            setFocusTarget({ area: 'modal_reroll_room' });
          } else if (rList.length > 0) {
            setFocusTarget({ area: 'room_join', index: 0 });
          } else {
            setFocusTarget({ area: 'create_toggle' });
          }
        } else if (cur.area === 'refresh') {
          setFocusTarget({ area: 'create_toggle' });
        } else if (cur.area === 'modal_track') {
          if (cur.index < levelsRef.current.length - 1) {
            setFocusTarget({ area: 'modal_track', index: cur.index + 1 });
          }
        } else if (cur.area === 'modal_mode') {
          if (cur.index < currentSupportedModesRef.current.length - 1) {
            setFocusTarget({ area: 'modal_mode', index: cur.index + 1 });
          }
        } else if (cur.area === 'room_join') {
          const room = rList[cur.index];
          if (curUserId && room && room.hostId === curUserId && !room.isPersistent) {
            setFocusTarget({ area: 'room_delete', index: cur.index });
          }
        }
      },
      handleNavUp: () => {
        const cur = focusTargetRef.current;
        const rList = roomsRef.current;
        if (cur.area === 'vehicles') {
          if (cur.index > 0) setFocusTarget({ area: 'vehicles', index: cur.index - 1 });
          else setFocusTarget({ area: 'reroll_identity' });
        } else if (cur.area === 'tires') {
          setFocusTarget({ area: 'vehicles', index: vehiclesRef.current.length - 1 });
        } else if (cur.area === 'reroll_identity') {
          setFocusTarget({ area: 'refresh' });
        } else if (cur.area === 'refresh') {
          setFocusTarget({ area: 'reroll_identity' });
        } else if (cur.area === 'create_toggle') {
          setFocusTarget({ area: 'refresh' });
        } else if (cur.area === 'modal_reroll_room') {
          setFocusTarget({ area: 'create_toggle' });
        } else if (cur.area === 'modal_track') {
          setFocusTarget({ area: 'modal_reroll_room' });
        } else if (cur.area === 'modal_mode') {
          setFocusTarget({ area: 'modal_track', index: Math.min(levelsRef.current.length - 1, cur.index) });
        } else if (cur.area === 'modal_launch') {
          setFocusTarget({ area: 'modal_mode', index: 0 });
        } else if (cur.area === 'room_join' || cur.area === 'room_delete') {
          if (cur.index > 0) {
            setFocusTarget({ area: 'room_join', index: cur.index - 1 });
          } else {
            setFocusTarget({ area: 'create_toggle' });
          }
        } else if (cur.area === 'quick_play') {
          if (showCreateModalRef.current) {
            setFocusTarget({ area: 'modal_launch' });
          } else if (rList.length > 0) {
            setFocusTarget({ area: 'room_join', index: rList.length - 1 });
          } else {
            setFocusTarget({ area: 'tires', index: 0 });
          }
        } else if (cur.area === 'back') {
          setFocusTarget({ area: 'quick_play' });
        }
      },
      handleNavDown: () => {
        const cur = focusTargetRef.current;
        const vList = vehiclesRef.current;
        const rList = roomsRef.current;
        if (cur.area === 'vehicles') {
          if (cur.index < vList.length - 1) {
            setFocusTarget({ area: 'vehicles', index: cur.index + 1 });
          } else {
            setFocusTarget({ area: 'tires', index: 0 });
          }
        } else if (cur.area === 'tires') {
          setFocusTarget({ area: 'quick_play' });
        } else if (cur.area === 'reroll_identity') {
          setFocusTarget({ area: 'vehicles', index: 0 });
        } else if (cur.area === 'refresh') {
          setFocusTarget({ area: 'create_toggle' });
        } else if (cur.area === 'create_toggle') {
          if (showCreateModalRef.current) {
            setFocusTarget({ area: 'modal_reroll_room' });
          } else if (rList.length > 0) {
            setFocusTarget({ area: 'room_join', index: 0 });
          } else {
            setFocusTarget({ area: 'quick_play' });
          }
        } else if (cur.area === 'modal_reroll_room') {
          setFocusTarget({ area: 'modal_track', index: 0 });
        } else if (cur.area === 'modal_track') {
          setFocusTarget({ area: 'modal_mode', index: 0 });
        } else if (cur.area === 'modal_mode') {
          setFocusTarget({ area: 'modal_launch' });
        } else if (cur.area === 'modal_launch') {
          setFocusTarget({ area: 'quick_play' });
        } else if (cur.area === 'room_join' || cur.area === 'room_delete') {
          if (cur.index < rList.length - 1) {
            setFocusTarget({ area: 'room_join', index: cur.index + 1 });
          } else {
            setFocusTarget({ area: 'quick_play' });
          }
        } else if (cur.area === 'quick_play') {
          setFocusTarget({ area: 'back' });
        }
      },
      handleConfirm: () => {
        const cur = focusTargetRef.current;
        const vList = vehiclesRef.current;
        const rList = roomsRef.current;
        if (cur.area === 'vehicles') {
          setSelectedVehicleId(vList[cur.index].id);
        } else if (cur.area === 'tires') {
          setSelectedTireType(AVAILABLE_TIRE_TYPES[cur.index]);
        } else if (cur.area === 'reroll_identity') {
          handleRerollNicknameRef.current();
        } else if (cur.area === 'refresh') {
          networkClient.requestRooms();
        } else if (cur.area === 'create_toggle') {
          if (isVersionMismatchRef.current) return;
          const next = !showCreateModalRef.current;
          setShowCreateModal(next);
          setCuratedRoomTitle(generateCuratedRoomTitle());
          setCreateError(null);
          if (next) {
            setFocusTarget({ area: 'modal_reroll_room' });
          } else {
            setFocusTarget({ area: 'create_toggle' });
          }
        } else if (cur.area === 'modal_reroll_room') {
          handleRerollRoomTitleRef.current();
        } else if (cur.area === 'modal_track') {
          handleSelectCreateTrack(levelsRef.current[cur.index].id);
        } else if (cur.area === 'modal_mode') {
          setCreateGameMode(currentSupportedModesRef.current[cur.index]);
        } else if (cur.area === 'modal_launch') {
          if (isVersionMismatchRef.current) return;
          executeCreateRoomRef.current();
        } else if (cur.area === 'room_join') {
          if (isVersionMismatchRef.current) return;
          const room = rList[cur.index];
          if (room) handleJoinRoomRef.current(room.id, room.levelId, room.gameMode);
        } else if (cur.area === 'room_delete') {
          const room = rList[cur.index];
          if (room) handleDeleteRoomRef.current(room);
        } else if (cur.area === 'quick_play') {
          if (isVersionMismatchRef.current) return;
          handleJoinRoomRef.current('gymkhana_freeroam', 'level5_gymkhana', 'freeroam');
        } else if (cur.area === 'back') {
          handleBackToMainRef.current();
        }
      },
      handleBack: () => {
        if (showCreateModalRef.current) {
          setShowCreateModal(false);
          setFocusTarget({ area: 'create_toggle' });
          return true; // consumed
        }
        return false; // let navigation return to main menu
      },
      handleSpecialX: () => {
        const cur = focusTargetRef.current;
        const rList = roomsRef.current;
        const curUserId = selfIdRef.current;
        if (cur.area === 'room_join' || cur.area === 'room_delete') {
          const room = rList[cur.index];
          if (room && curUserId && room.hostId === curUserId && !room.isPersistent) {
            handleDeleteRoomRef.current(room);
          }
        }
      },
      handleSpecialY: () => {
        networkClient.requestRooms();
      },
    });

    return unregister;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPreset = getVehiclePreset(selectedVehicleId);
  const activeTireDef = getTireDefinition(selectedTireType);

  return (
    <div
      className="multiplayer-subview menu-scalable-container"
      style={{
        ...menuStyles.subView,
        color: textColor,
        width: '100%',
        minWidth: '560px',
        maxWidth: '960px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h2 style={{ ...menuStyles.subViewTitle, margin: 0 }}>Multiplayer Lobby & Rooms</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: isVersionMismatch
                ? 'rgba(239, 68, 68, 0.25)'
                : status === 'disconnected'
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(56, 189, 248, 0.15)',
              border: `1px solid ${
                isVersionMismatch
                  ? 'rgba(239, 68, 68, 0.6)'
                  : status === 'disconnected'
                  ? 'rgba(239, 68, 68, 0.4)'
                  : 'rgba(56, 189, 248, 0.4)'
              }`,
              color: isVersionMismatch || status === 'disconnected' ? '#F87171' : '#38BDF8',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '1px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isVersionMismatch || status === 'disconnected' ? '#F87171' : '#34D399',
              }}
            />
            {isVersionMismatch
              ? 'UPDATE REQUIRED'
              : status === 'disconnected'
              ? 'OFFLINE'
              : `ONLINE (${ping} MS)`}
          </span>
          <button
            type="button"
            data-gamepad-focused={focusTarget.area === 'refresh' ? 'true' : undefined}
            onClick={() => {
              setFocusTarget({ area: 'refresh' });
              networkClient.requestRooms();
            }}
            onPointerMove={() => setFocusTarget({ area: 'refresh' })}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              color: '#94A3B8',
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              ...getGamepadFocusStyle(focusTarget.area === 'refresh'),
            }}
            title="Refresh rooms list (Gamepad: Y)"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      <p style={{ ...menuStyles.subtitle, color: '#94A3B8', margin: '0 0 16px 0', fontSize: '13px' }}>
        Create custom rooms on any track with Free Roam, Time Attack, or Gymkhana Blitz. Drive any championship vehicle with zero input lag.
      </p>

      {/* Driver Profile Bar */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: '10px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        <div style={{ flex: '0 0 auto', fontSize: '11px', fontWeight: 800, color: '#38BDF8', letterSpacing: '1px' }}>
          DRIVER CALLSIGN:
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 auto' }}>
          <span
            style={{
              padding: '6px 12px',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '6px',
              color: '#38BDF8',
              fontWeight: 800,
              fontSize: '13px',
              letterSpacing: '0.5px',
            }}
          >
            🏷️ {nickname || 'Apex_Fox_42'}
          </span>
          <button
            type="button"
            data-gamepad-focused={focusTarget.area === 'reroll_identity' ? 'true' : undefined}
            onClick={() => {
              setFocusTarget({ area: 'reroll_identity' });
              handleRerollNickname();
            }}
            onPointerMove={() => setFocusTarget({ area: 'reroll_identity' })}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '6px',
              color: '#E2E8F0',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              ...getGamepadFocusStyle(focusTarget.area === 'reroll_identity'),
            }}
            title="Generate a safe curated racing callsign (Gamepad: Select/Confirm)"
          >
            🎲 REROLL TAG
          </button>
          <span
            style={{
              fontSize: '9px',
              color: '#34D399',
              fontWeight: 700,
              background: 'rgba(16, 185, 129, 0.15)',
              padding: '3px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(52, 211, 153, 0.3)',
            }}
          >
            ✓ SAFE IDENTIFIER
          </span>
        </div>
        <div style={{ flex: 1, fontSize: '11px', color: '#94A3B8', textAlign: 'right' }}>
          Selected: <strong style={{ color: '#38BDF8' }}>{currentPreset.name}</strong> ({currentPreset.stats.driveType}, {currentPreset.config.engine.maxSpeed} km/h) • Tire: <strong style={{ color: activeTireDef.color }}>{activeTireDef.label}</strong>
        </div>
      </div>

      {/* Grid: All 7 Vehicles Selector & Room Browser */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: '16px', width: '100%', marginBottom: '16px' }}>
        {/* Left Column: All 7 Vehicles Selector */}
        <div
          style={{
            ...menuStyles.modeCard,
            borderColor: 'rgba(56, 189, 248, 0.3)',
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.05) 0%, rgba(15, 23, 42, 0.7) 100%)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#38BDF8', letterSpacing: '1px' }}>
              CHAMPIONSHIP ROSTER (7 CARS)
            </span>
            <span style={{ fontSize: '10px', color: '#64748B' }}>LB / RB TO SWITCH</span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: '340px',
              overflowY: 'auto',
              paddingRight: '4px',
            }}
          >
            {vehicles.map((v, idx) => {
              const isSelected = selectedVehicleId === v.id;
              const isFocused = focusTarget.area === 'vehicles' && focusTarget.index === idx;
              return (
                <button
                  key={v.id}
                  type="button"
                  data-gamepad-focused={isFocused ? 'true' : undefined}
                  onClick={() => {
                    setSelectedVehicleId(v.id);
                    setFocusTarget({ area: 'vehicles', index: idx });
                  }}
                  onPointerMove={() => setFocusTarget({ area: 'vehicles', index: idx })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: isSelected ? 'rgba(56, 189, 248, 0.22)' : 'rgba(0, 0, 0, 0.3)',
                    border: isSelected ? '1px solid #38BDF8' : '1px solid rgba(255, 255, 255, 0.08)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    textAlign: 'left',
                    ...getGamepadFocusStyle(isFocused),
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: isSelected ? '#38BDF8' : '#F8FAFC' }}>
                      {v.name}
                    </div>
                    <div style={{ fontSize: '10px', color: isSelected ? '#BAE6FD' : '#64748B' }}>
                      {v.category.toUpperCase()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: isSelected ? '#0284C7' : 'rgba(255, 255, 255, 0.08)',
                        color: isSelected ? '#FFFFFF' : '#94A3B8',
                      }}
                    >
                      {v.stats.driveType}
                    </span>
                    <span style={{ fontSize: '10px', color: '#94A3B8' }}>{v.config.engine.maxSpeed} km/h</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Tire Compound Selection */}
          <div
            style={{
              marginTop: '8px',
              padding: '10px',
              borderRadius: '8px',
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#38BDF8', letterSpacing: '1px' }}>
                TIRE COMPOUND
              </span>
              <span style={{ fontSize: '10px', fontWeight: 700, color: activeTireDef.color }}>
                {activeTireDef.icon} {activeTireDef.label}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '6px',
                width: '100%',
              }}
            >
              {AVAILABLE_TIRE_TYPES.map((tType, idx) => {
                const tireDef = getTireDefinition(tType);
                const isSelected = selectedTireType === tType;
                const isFocused = focusTarget.area === 'tires' && focusTarget.index === idx;

                return (
                  <button
                    key={tType}
                    type="button"
                    data-gamepad-focused={isFocused ? 'true' : undefined}
                    onClick={() => {
                      setSelectedTireType(tType);
                      setFocusTarget({ area: 'tires', index: idx });
                    }}
                    onPointerMove={() => setFocusTarget({ area: 'tires', index: idx })}
                    style={{
                      minHeight: '38px',
                      padding: '4px 6px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '2px',
                      background: isSelected
                        ? `linear-gradient(135deg, ${tireDef.badgeBg} 0%, rgba(15, 23, 42, 0.9) 100%)`
                        : 'rgba(255, 255, 255, 0.04)',
                      border: isSelected
                        ? `1.5px solid ${tireDef.color}`
                        : '1px solid rgba(255, 255, 255, 0.12)',
                      boxShadow: isSelected ? `0 0 10px ${tireDef.badgeBg}` : 'none',
                      color: isSelected ? '#FFFFFF' : '#94A3B8',
                      fontWeight: 700,
                      fontSize: '11px',
                      transition: 'all 0.15s ease',
                      boxSizing: 'border-box',
                      touchAction: 'manipulation',
                      ...getGamepadFocusStyle(isFocused),
                    }}
                    title={tireDef.description}
                  >
                    <span style={{ fontSize: '13px' }}>{tireDef.icon}</span>
                    <span style={{ letterSpacing: '0.4px', fontWeight: 800, fontSize: '10px' }}>{tireDef.label}</span>
                  </button>
                );
              })}
            </div>

            <span style={{ fontSize: '9px', color: '#94A3B8', lineHeight: 1.2 }}>
              {activeTireDef.description}
            </span>
          </div>
        </div>

        {/* Right Column: Room Browser & Creator */}
        <div
          style={{
            ...menuStyles.modeCard,
            borderColor: 'rgba(56, 189, 248, 0.3)',
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.05) 0%, rgba(15, 23, 42, 0.7) 100%)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#38BDF8', letterSpacing: '1px' }}>
              ACTIVE ROOMS ({rooms.length})
            </span>
            <button
              type="button"
              disabled={isVersionMismatch}
              data-gamepad-focused={focusTarget.area === 'create_toggle' ? 'true' : undefined}
              onClick={() => {
                if (isVersionMismatch) return;
                const next = !showCreateModal;
                setShowCreateModal(next);
                setCuratedRoomTitle(generateCuratedRoomTitle());
                setCreateError(null);
                setFocusTarget(next ? { area: 'modal_reroll_room' } : { area: 'create_toggle' });
              }}
              onPointerMove={() => setFocusTarget({ area: 'create_toggle' })}
              style={{
                background: isVersionMismatch
                  ? 'rgba(75, 85, 99, 0.3)'
                  : showCreateModal
                  ? 'rgba(239, 68, 68, 0.2)'
                  : 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                border: `1px solid ${
                  isVersionMismatch ? '#4B5563' : showCreateModal ? '#F87171' : '#38BDF8'
                }`,
                borderRadius: '6px',
                color: isVersionMismatch ? '#9CA3AF' : '#FFFFFF',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 800,
                cursor: isVersionMismatch ? 'not-allowed' : 'pointer',
                opacity: isVersionMismatch ? 0.6 : 1,
                transition: 'all 0.15s ease',
                ...getGamepadFocusStyle(focusTarget.area === 'create_toggle'),
              }}
            >
              {isVersionMismatch
                ? '➕ Create (Locked)'
                : showCreateModal
                ? '✖ Cancel (B)'
                : '➕ Create Room'}
            </button>
          </div>

          {/* Inline Create Room Form */}
          {showCreateModal && (
            <form
              onSubmit={handleCreateRoom}
              style={{
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#38BDF8', letterSpacing: '0.5px' }}>
                CUSTOM ROOM SETUP:
              </div>

              {/* Room Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    flex: 1,
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    borderRadius: '6px',
                    padding: '7px 10px',
                    color: '#F8FAFC',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>🏷️ {curatedRoomTitle}</span>
                  <span
                    style={{
                      fontSize: '9px',
                      color: '#34D399',
                      fontWeight: 700,
                      background: 'rgba(16, 185, 129, 0.15)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    CURATED TITLE
                  </span>
                </div>
                <button
                  type="button"
                  data-gamepad-focused={focusTarget.area === 'modal_reroll_room' ? 'true' : undefined}
                  onClick={() => {
                    setFocusTarget({ area: 'modal_reroll_room' });
                    handleRerollRoomTitle();
                  }}
                  onPointerMove={() => setFocusTarget({ area: 'modal_reroll_room' })}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    borderRadius: '6px',
                    color: '#E2E8F0',
                    padding: '7px 12px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                    ...getGamepadFocusStyle(focusTarget.area === 'modal_reroll_room'),
                  }}
                  title="Reroll safe curated room title"
                >
                  🎲 REROLL
                </button>
              </div>

              {/* Track Selection */}
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', marginBottom: '4px' }}>
                  SELECT TRACK:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '6px' }}>
                  {levels.map((lvl, lvlIdx) => {
                    const isSelected = createLevelId === lvl.id;
                    const isFocused = focusTarget.area === 'modal_track' && focusTarget.index === lvlIdx;
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        data-gamepad-focused={isFocused ? 'true' : undefined}
                        onClick={() => {
                          handleSelectCreateTrack(lvl.id);
                          setFocusTarget({ area: 'modal_track', index: lvlIdx });
                        }}
                        onPointerMove={() => setFocusTarget({ area: 'modal_track', index: lvlIdx })}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '6px',
                          background: isSelected ? 'rgba(56, 189, 248, 0.25)' : 'rgba(15, 23, 42, 0.8)',
                          border: isSelected ? '1px solid #38BDF8' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: isSelected ? '#38BDF8' : '#CBD5E1',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          transition: 'all 0.15s ease',
                          ...getGamepadFocusStyle(isFocused),
                        }}
                      >
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {lvl.name}
                        </span>
                        <span style={{ fontSize: '9px', color: isSelected ? '#BAE6FD' : '#64748B', fontWeight: 500 }}>
                          {lvl.surfaceDescription}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Game Mode Selection */}
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', marginBottom: '4px' }}>
                  SELECT GAME MODE ({createPreset.name}):
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {currentSupportedModes.map((mode, mIdx) => {
                    const isSelected = createGameMode === mode;
                    const isFocused = focusTarget.area === 'modal_mode' && focusTarget.index === mIdx;
                    const label =
                      mode === 'timeattack'
                        ? '⏱️ TIME ATTACK'
                        : mode === 'gymkhana_blitz'
                          ? '⚡ GYMKHANA BLITZ'
                          : mode === 'tag'
                            ? '🎯 RALLY TAG'
                            : '🌴 FREE ROAM';
                    const activeColor =
                      mode === 'timeattack'
                        ? '#F87171'
                        : mode === 'gymkhana_blitz'
                          ? '#FBBF24'
                          : mode === 'tag'
                            ? '#F43F5E'
                            : '#34D399';
                    const activeBg =
                      mode === 'timeattack'
                        ? 'rgba(239, 68, 68, 0.2)'
                        : mode === 'gymkhana_blitz'
                          ? 'rgba(245, 158, 11, 0.2)'
                          : mode === 'tag'
                            ? 'rgba(244, 63, 94, 0.2)'
                            : 'rgba(16, 185, 129, 0.2)';
                    const activeBorder =
                      mode === 'timeattack'
                        ? '#EF4444'
                        : mode === 'gymkhana_blitz'
                          ? '#F59E0B'
                          : mode === 'tag'
                            ? '#F43F5E'
                            : '#10B981';

                    return (
                      <button
                        key={mode}
                        type="button"
                        data-gamepad-focused={isFocused ? 'true' : undefined}
                        onClick={() => {
                          setCreateGameMode(mode);
                          setFocusTarget({ area: 'modal_mode', index: mIdx });
                        }}
                        onPointerMove={() => setFocusTarget({ area: 'modal_mode', index: mIdx })}
                        style={{
                          flex: 1,
                          padding: '7px 10px',
                          borderRadius: '6px',
                          background: isSelected ? activeBg : 'rgba(15, 23, 42, 0.8)',
                          border: isSelected ? `1px solid ${activeBorder}` : '1px solid rgba(255, 255, 255, 0.08)',
                          color: isSelected ? activeColor : '#94A3B8',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          textAlign: 'center',
                          ...getGamepadFocusStyle(isFocused),
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {createError && (
                <div style={{ color: '#F87171', fontSize: '10px', fontWeight: 600 }}>{createError}</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '2px' }}>
                <button
                  type="submit"
                  data-gamepad-focused={focusTarget.area === 'modal_launch' ? 'true' : undefined}
                  onPointerMove={() => setFocusTarget({ area: 'modal_launch' })}
                  style={{
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    border: '1px solid #34D399',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    padding: '6px 14px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    ...getGamepadFocusStyle(focusTarget.area === 'modal_launch'),
                  }}
                >
                  🚀 Create & Launch Room (A)
                </button>
              </div>
            </form>
          )}

          {/* Rooms List */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: showCreateModal ? '140px' : '340px',
              overflowY: 'auto',
              paddingRight: '4px',
            }}
          >
            {rooms.length === 0 ? (
              <div
                style={{
                  fontSize: '11px',
                  color: '#64748B',
                  textAlign: 'center',
                  padding: '24px 8px',
                  fontStyle: 'italic',
                }}
              >
                No active rooms found. Connecting to relay server...
              </div>
            ) : (
              rooms.map((r, rIdx) => {
                const isUserHost = selfId && r.hostId === selfId;
                const roomLevel = getLevelPreset(r.levelId);
                const modeLabel =
                  r.gameMode === 'timeattack'
                    ? 'TIME ATTACK'
                    : r.gameMode === 'gymkhana_blitz'
                      ? 'GYMKHANA BLITZ'
                      : r.gameMode === 'tag'
                        ? 'RALLY TAG'
                        : 'FREE ROAM';
                const modeColor =
                  r.gameMode === 'timeattack'
                    ? '#F87171'
                    : r.gameMode === 'gymkhana_blitz'
                      ? '#FBBF24'
                      : r.gameMode === 'tag'
                        ? '#F43F5E'
                        : '#34D399';
                const modeBg =
                  r.gameMode === 'timeattack'
                    ? 'rgba(239, 68, 68, 0.15)'
                    : r.gameMode === 'gymkhana_blitz'
                      ? 'rgba(245, 158, 11, 0.15)'
                      : r.gameMode === 'tag'
                        ? 'rgba(244, 63, 94, 0.15)'
                        : 'rgba(16, 185, 129, 0.15)';
                const modeBorder =
                  r.gameMode === 'timeattack'
                    ? 'rgba(239, 68, 68, 0.4)'
                    : r.gameMode === 'gymkhana_blitz'
                      ? 'rgba(245, 158, 11, 0.4)'
                      : r.gameMode === 'tag'
                        ? 'rgba(244, 63, 94, 0.4)'
                        : 'rgba(16, 185, 129, 0.4)';

                const isJoinFocused = focusTarget.area === 'room_join' && focusTarget.index === rIdx;
                const isDeleteFocused = focusTarget.area === 'room_delete' && focusTarget.index === rIdx;

                return (
                  <div
                    key={r.id}
                    style={{
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: r.isPersistent ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#F8FAFC' }}>
                          {r.name}
                        </span>
                        {r.isPersistent ? (
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: 'rgba(56, 189, 248, 0.2)',
                              color: '#38BDF8',
                              border: '1px solid rgba(56, 189, 248, 0.4)',
                            }}
                          >
                            OFFICIAL
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: 'rgba(168, 85, 247, 0.2)',
                              color: '#C084FC',
                              border: '1px solid rgba(168, 85, 247, 0.4)',
                            }}
                          >
                            CUSTOM
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: modeBg,
                            color: modeColor,
                            border: `1px solid ${modeBorder}`,
                          }}
                        >
                          {modeLabel}
                        </span>
                      </div>
                      <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '3px' }}>
                        Track: <strong style={{ color: '#E2E8F0' }}>{roomLevel.name}</strong> • Host: <strong style={{ color: '#CBD5E1' }}>{r.hostNickname}</strong> • Drivers: {r.playerCount}/{r.maxPlayers}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {/* Delete button only if user is host and room is not official */}
                      {isUserHost && !r.isPersistent && (
                        <button
                          type="button"
                          data-gamepad-focused={isDeleteFocused ? 'true' : undefined}
                          onClick={() => {
                            setFocusTarget({ area: 'room_delete', index: rIdx });
                            handleDeleteRoom(r);
                          }}
                          onPointerMove={() => setFocusTarget({ area: 'room_delete', index: rIdx })}
                          style={{
                            background: 'rgba(239, 68, 68, 0.2)',
                            border: '1px solid rgba(239, 68, 68, 0.5)',
                            borderRadius: '6px',
                            color: '#F87171',
                            padding: '6px 8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            ...getGamepadFocusStyle(isDeleteFocused),
                          }}
                          title="Delete this room (Gamepad: X)"
                        >
                          🗑️
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isVersionMismatch}
                        data-gamepad-focused={isJoinFocused ? 'true' : undefined}
                        onClick={() => {
                          if (isVersionMismatch) return;
                          setFocusTarget({ area: 'room_join', index: rIdx });
                          handleJoinRoom(r.id, r.levelId, r.gameMode);
                        }}
                        onPointerMove={() => setFocusTarget({ area: 'room_join', index: rIdx })}
                        style={{
                          background: isVersionMismatch
                            ? 'rgba(75, 85, 99, 0.4)'
                            : 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                          border: `1px solid ${isVersionMismatch ? '#4B5563' : '#38BDF8'}`,
                          borderRadius: '6px',
                          color: isVersionMismatch ? '#9CA3AF' : '#FFFFFF',
                          padding: '6px 14px',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: isVersionMismatch ? 'not-allowed' : 'pointer',
                          opacity: isVersionMismatch ? 0.6 : 1,
                          letterSpacing: '0.5px',
                          transition: 'all 0.15s ease',
                          ...getGamepadFocusStyle(isJoinFocused),
                        }}
                      >
                        {isVersionMismatch ? 'LOCKED' : 'JOIN'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {isVersionMismatch && (
        <div
          style={{
            marginBottom: '14px',
            padding: '14px 16px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(185, 28, 28, 0.3) 100%)',
            border: '1px solid rgba(239, 68, 68, 0.6)',
            boxShadow: '0 0 20px rgba(239, 68, 68, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#FCA5A5', fontWeight: 800, fontSize: '12px', letterSpacing: '1px' }}>
              ⚠️ GAME UPDATE REQUIRED
            </span>
            <span style={{ color: '#F87171', fontSize: '11px', fontWeight: 600 }}>
              Client: v{versionMismatch?.clientVersion || GAME_VERSION} • Server: v{versionMismatch?.serverVersion || 'Latest'}
            </span>
          </div>
          <div style={{ color: '#FEE2E2', fontSize: '12px', lineHeight: 1.4 }}>
            Your game client is out of date and incompatible with the multiplayer server. Online matchmaking is disabled until the game is updated.
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              }}
              style={{
                background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
                color: '#FFFFFF',
                border: '1px solid #F87171',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: '0.5px',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
              }}
            >
              🔄 RELOAD & UPDATE GAME NOW
            </button>
          </div>
        </div>
      )}

      {error && !isVersionMismatch && (
        <div
          style={{
            marginBottom: '12px',
            padding: '8px 12px',
            borderRadius: '6px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#F87171',
            fontSize: '12px',
          }}
        >
          {error}
        </div>
      )}

      {/* Quick Play Action: Join Official Free Roam */}
      <button
        type="button"
        disabled={isVersionMismatch}
        data-gamepad-focused={focusTarget.area === 'quick_play' ? 'true' : undefined}
        style={{
          ...menuStyles.button,
          background: isVersionMismatch
            ? 'rgba(75, 85, 99, 0.4)'
            : 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
          color: isVersionMismatch ? '#9CA3AF' : '#FFFFFF',
          borderColor: isVersionMismatch ? '#4B5563' : '#38BDF8',
          boxShadow: isVersionMismatch ? 'none' : '0 0 16px rgba(56, 189, 248, 0.35)',
          cursor: isVersionMismatch ? 'not-allowed' : 'pointer',
          opacity: isVersionMismatch ? 0.6 : 1,
          width: '100%',
          minHeight: '44px',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '13px',
          letterSpacing: '0.5px',
          ...getFocusStyle(focusedIndex === 0 || focusTarget.area === 'quick_play'),
          ...getGamepadFocusStyle(focusTarget.area === 'quick_play'),
        }}
        onPointerMove={(e) => {
          onPointerMoveItem(0, e);
          setFocusTarget({ area: 'quick_play' });
        }}
        onClick={() => {
          if (isVersionMismatch) return;
          handleJoinRoom('gymkhana_freeroam', 'level5_gymkhana', 'freeroam');
        }}
      >
        {isVersionMismatch
          ? '⚠️ QUICK PLAY DISABLED (GAME UPDATE REQUIRED)'
          : '🏎️ QUICK PLAY: ENTER APEX ARENA (OFFICIAL)'}
      </button>

      {/* Back to Main Menu Button */}
      <button
        type="button"
        data-gamepad-focused={focusTarget.area === 'back' ? 'true' : undefined}
        style={{
          ...menuStyles.button,
          ...menuStyles.secondaryButton,
          color: textColor,
          borderColor: 'rgba(255, 255, 255, 0.12)',
          marginTop: '8px',
          width: '100%',
          minHeight: '38px',
          justifyContent: 'center',
          fontWeight: 600,
          fontSize: '12px',
          ...getFocusStyle(focusedIndex === 1 || focusTarget.area === 'back'),
          ...getGamepadFocusStyle(focusTarget.area === 'back'),
        }}
        onPointerMove={(e) => {
          onPointerMoveItem(1, e);
          setFocusTarget({ area: 'back' });
        }}
        onClick={handleBackToMain}
      >
        Back to Main Menu
      </button>

      {/* Gamepad & Controller Accessibility Legend */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '14px',
          flexWrap: 'wrap',
          marginTop: '10px',
          padding: '6px 12px',
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          borderRadius: '6px',
          fontSize: '10px',
          fontWeight: 700,
          color: '#94A3B8',
          letterSpacing: '0.3px',
        }}
      >
        <span>🎮 <strong style={{ color: '#E2E8F0' }}>D-PAD / STICK</strong> Navigate</span>
        <span><strong style={{ color: '#38BDF8' }}>A / ENTER</strong> Select / Join / Create</span>
        <span><strong style={{ color: '#F87171' }}>B / ESC</strong> Back / Cancel</span>
        <span><strong style={{ color: '#FBBF24' }}>LB / RB</strong> Switch Car</span>
        <span><strong style={{ color: '#CBD5E1' }}>X</strong> Delete Room</span>
        <span><strong style={{ color: '#34D399' }}>Y</strong> Refresh</span>
      </div>
    </div>
  );
}
