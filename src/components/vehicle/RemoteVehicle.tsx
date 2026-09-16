import { useRef, useState, useEffect, useMemo, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGLTF, Clone, Detailed } from '@react-three/drei';
import { getVehiclePreset } from '@/config/vehicleRegistry';
import { networkClient } from '@/network/networkClient';
import { Wheel } from '@/components/vehicle/Wheel';
import { VehicleModelErrorBoundary } from '@/components/vehicle/Vehicle';
import { useSettingsStore } from '@/store/settingsStore';
import { useTagStore } from '@/store/tagStore';
import { isMobileDevice } from '@/utils/device';
import {
  registerRemoteVehicleMesh,
  unregisterRemoteVehicleMesh,
  getRemoteVehicleMesh,
} from './remoteVehicleRegistry';
import type { RemotePlayerSummary } from '@/types/network';

interface RemoteVehicleProps {
  player: RemotePlayerSummary;
}

const INTERPOLATION_DELAY_MS = 60; // 60ms jitter buffer

// Module-level scratch instances for zero-allocation useFrame updates
const scratchTargetPos = new THREE.Vector3();
const scratchTargetRot = new THREE.Quaternion();

function RemoteVehicleVisualModel({
  modelPath,
  positionOffset,
  rotationOffset,
  scale,
  chassisSize,
}: {
  modelPath: string;
  positionOffset: [number, number, number];
  rotationOffset?: [number, number, number];
  scale: [number, number, number];
  chassisSize: [number, number, number];
}) {
  const { scene } = useGLTF(modelPath);
  const isMobile = isMobileDevice();
  const lodDistances = useMemo(() => (isMobile ? [0, 45, 120] : [0, 70, 200]), [isMobile]);

  return (
    <Detailed distances={lodDistances}>
      {/* LOD 0: GLB 3D Mesh */}
      <Clone
        object={scene}
        position={positionOffset}
        scale={scale}
        rotation={rotationOffset ?? [0, 0, 0]}
        castShadow={!isMobile}
        receiveShadow={!isMobile}
      />
      {/* LOD 1: Simplified Proxy Box */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[chassisSize[0], chassisSize[1], chassisSize[2]]} />
        <meshStandardMaterial color="#4A5568" roughness={0.6} />
      </mesh>
      {/* LOD 2: Minimal Box */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[chassisSize[0], chassisSize[1], chassisSize[2]]} />
        <meshBasicMaterial color="#2D3748" />
      </mesh>
    </Detailed>
  );
}

function RemotePlayerNameplate({
  nickname,
  vehicleName,
  isTagger,
  yOffset,
}: {
  nickname: string;
  vehicleName: string;
  isTagger: boolean;
  yOffset: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const texture = useMemo(() => {
    if (typeof document === 'undefined') {
      return new THREE.CanvasTexture({} as unknown as HTMLCanvasElement);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    canvasRef.current = canvas;
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 2;
    return tex;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 512, 128);

    // Dark pill badge
    ctx.beginPath();
    const r = 24;
    const x = 12, y = 12, w = 488, h = 104;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    if (isTagger) {
      ctx.fillStyle = 'rgba(220, 38, 38, 0.95)';
      ctx.fill();
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 6;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // Status indicator dot
    ctx.beginPath();
    ctx.arc(52, 64, 14, 0, Math.PI * 2);
    ctx.fillStyle = isTagger ? '#EF4444' : '#38BDF8';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Driver Nickname
    ctx.font = 'bold 40px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(nickname, 86, 48);

    // Vehicle model / tagger status badge
    ctx.font = 'bold 24px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = isTagger ? '#FEE2E2' : '#94A3B8';
    ctx.fillText(isTagger ? 'TAGGER' : vehicleName, 86, 88);

    texture.needsUpdate = true;
  }, [nickname, vehicleName, isTagger, texture]);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  useFrame(({ camera }) => {
    if (meshRef.current) {
      meshRef.current.quaternion.copy(camera.quaternion);
    }
  });

  return (
    <mesh ref={meshRef} position={[0, yOffset, 0]}>
      <planeGeometry args={[2.2, 0.55]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthTest={true}
        depthWrite={false}
      />
    </mesh>
  );
}

export function RemoteVehicle({ player }: RemoteVehicleProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hasFirstSample, setHasFirstSample] = useState(false);

  const wheelRefs = [
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
  ];

  const preset = getVehiclePreset(player.vehicleId);
  const { chassisSize, wheels } = preset.config;
  const buffer = networkClient.getEntityBuffer(player.id);

  const isMobile = isMobileDevice();
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);
  const useOptimized = isMobile || graphicsQuality !== 'very_high';
  const effectiveModelPath = useOptimized
    ? (preset.optimizedModelPath ?? (preset.modelPath.endsWith('.glb') ? preset.modelPath.replace(/\.glb$/, '_opt.glb') : preset.modelPath))
    : preset.modelPath;

  const modelScale = preset.modelScale ?? [4.5, 4.5, 4.5];
  const modelOffset = preset.modelPositionOffset ?? [0, 0.2, 0.1];
  const modelRotationOffset = preset.modelRotationOffset ?? [0, 0, 0];

  useEffect(() => {
    if (groupRef.current) {
      registerRemoteVehicleMesh(player.id, groupRef.current);
    }
    return () => {
      unregisterRemoteVehicleMesh(player.id);
    };
  }, [player.id]);

  useFrame(() => {
    if (!groupRef.current) return;

    if (!getRemoteVehicleMesh(player.id)) {
      registerRemoteVehicleMesh(player.id, groupRef.current);
    }

    const renderTime = Date.now() - INTERPOLATION_DELAY_MS;
    const sample = buffer.sample(renderTime, scratchTargetPos, scratchTargetRot);

    if (sample) {
      if (!hasFirstSample) {
        setHasFirstSample(true);
      }
      groupRef.current.visible = true;
      groupRef.current.position.copy(scratchTargetPos);
      groupRef.current.quaternion.copy(scratchTargetRot);

      // Animate wheels
      // FL (0)
      if (wheelRefs[0].current) {
        wheelRefs[0].current.rotation.y = sample.steer;
        const inner = wheelRefs[0].current.children[0];
        if (inner) inner.rotation.x = sample.wheelRots[0];
      }
      // FR (1)
      if (wheelRefs[1].current) {
        wheelRefs[1].current.rotation.y = sample.steer;
        const inner = wheelRefs[1].current.children[0];
        if (inner) inner.rotation.x = sample.wheelRots[1];
      }
      // RL (2)
      if (wheelRefs[2].current) {
        const inner = wheelRefs[2].current.children[0];
        if (inner) inner.rotation.x = sample.wheelRots[2];
      }
      // RR (3)
      if (wheelRefs[3].current) {
        const inner = wheelRefs[3].current.children[0];
        if (inner) inner.rotation.x = sample.wheelRots[3];
      }
    } else if (!hasFirstSample) {
      // Hide until first telemetry snapshot is received to avoid rendering at [0,0,0]
      groupRef.current.visible = false;
    }
  });

  const isTagger = useTagStore((s) => s.taggerId === player.id);

  return (
    <group ref={groupRef} visible={hasFirstSample}>
      {/* Floating 3D WebGL Billboard Nameplate */}
      {hasFirstSample && (
        <RemotePlayerNameplate
          nickname={player.nickname}
          vehicleName={preset.name}
          isTagger={isTagger}
          yOffset={chassisSize[1] + 1.2}
        />
      )}

      {/* Visual Chassis Model */}
      <VehicleModelErrorBoundary
        fallback={
          <mesh position={[0, 0.8, 0]}>
            <boxGeometry args={chassisSize} />
            <meshStandardMaterial color="#475569" roughness={0.6} />
          </mesh>
        }
      >
        <Suspense
          fallback={
            <mesh position={[0, 0.8, 0]}>
              <boxGeometry args={chassisSize} />
              <meshStandardMaterial color="#334155" roughness={0.7} />
            </mesh>
          }
        >
          <RemoteVehicleVisualModel
            modelPath={effectiveModelPath}
            positionOffset={modelOffset}
            rotationOffset={modelRotationOffset}
            scale={modelScale}
            chassisSize={chassisSize}
          />
        </Suspense>
      </VehicleModelErrorBoundary>

      {/* Wheels with realistic suspension rest offset */}
      {wheels.map((w, index) => (
        <Wheel
          key={index}
          ref={wheelRefs[index]}
          radius={w.radius}
          isRightSide={index % 2 === 1}
          position={[
            w.position[0],
            w.position[1] - w.suspensionRestLength * 0.5,
            w.position[2],
          ]}
        />
      ))}
    </group>
  );
}
