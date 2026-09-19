import type { Vector3Tuple } from 'three';

/**
 * Configuration for a single wheel on the vehicle.
 */
export interface WheelInfo {
  /** Position offset relative to chassis center [x, y, z] */
  readonly position: Vector3Tuple;
  /** Wheel radius in world units */
  readonly radius: number;
  /** Suspension rest length */
  readonly suspensionRestLength: number;
  /** Maximum suspension travel distance */
  readonly suspensionTravel: number;
  /** Suspension stiffness coefficient */
  readonly suspensionStiffness: number;
  /** Suspension damping coefficient (base reference) */
  readonly suspensionDamping: number;
  /** Optional custom compression / bump damping coefficient */
  readonly suspensionCompression?: number;
  /** Optional custom relaxation / rebound damping coefficient */
  readonly suspensionRelaxation?: number;
  /** Whether this wheel can steer */
  readonly steerable: boolean;
  /** Whether this wheel receives engine force */
  readonly powered: boolean;
  /** Maximum force the suspension spring can apply (N) */
  readonly maxSuspensionForce?: number;
  /** Minimum suspension length (hard bump stop limit in meters). Prevents wheels from penetrating wheel arches under heavy landings. */
  readonly minSuspensionLength?: number;
}

/**
 * Engine configuration
 */
export interface EngineConfig {
  /** Maximum engine force applied to powered wheels */
  readonly maxForce: number;
  /** Maximum speed in km/h (for HUD / limiter) */
  readonly maxSpeed: number;
  /** Optional turbo boost multiplier when peak boost is reached (e.g. 1.25 for Group B, default: 1.10) */
  readonly turboBoostMultiplier?: number;
  /** Optional RPM threshold above which turbo boost builds (default: 3800 RPM) */
  readonly boostThresholdRpm?: number;
  /** Optional rate at which turbo builds pressure per second (default: 3.2) */
  readonly turboSpoolRate?: number;
}

/**
 * Braking configuration
 */
export interface BrakesConfig {
  /** Maximum braking force */
  readonly maxForce: number;
  /** Handbrake force (applied to rear wheels only) */
  readonly handbrakeForce: number;
  /** Brake bias towards the front (0.0 = 100% rear, 1.0 = 100% front). Typically ~0.7. */
  readonly frontBias: number;
}

/**
 * Drivetrain configuration
 */
export interface DrivetrainConfig {
  /** Torque bias towards the front (0.0 = 100% rear-wheel drive, 1.0 = 100% front-wheel drive, 0.5 = 50/50 AWD) */
  readonly frontBias: number;
}

/**
 * Suspension & Chassis dynamics configuration
 */
export interface SuspensionConfig {
  /** Stiffness of the front anti-roll bar */
  readonly frontAntiRollBarStiffness: number;
  /** Stiffness of the rear anti-roll bar */
  readonly rearAntiRollBarStiffness: number;
  /** Optional anti-squat longitudinal stiffness multiplier (default ~32.0) */
  readonly antiSquatStiffness?: number;
}

/**
 * Visual & physical sprung mass dynamics (chassis body roll, pitch dive/squat, heave)
 */
export interface ChassisDynamicsConfig {
  /** Maximum roll angle in radians during hard cornering (default ~0.085 rad / 4.9 deg) */
  readonly maxRollAngle?: number;
  /** Roll stiffness multiplier (higher = flatter cornering, lower = more body roll lean) */
  readonly rollStiffness?: number;
  /** Maximum pitch dive angle in radians under hard braking (default ~0.055 rad / 3.1 deg) */
  readonly maxPitchDive?: number;
  /** Maximum pitch squat angle in radians under hard launch (default ~0.045 rad / 2.6 deg) */
  readonly maxPitchSquat?: number;
  /** Pitch stiffness multiplier (higher = flatter under braking/acceleration) */
  readonly pitchStiffness?: number;
  /** Natural resonant frequency in rad/s of the sprung mass body roll (default ~11.0) */
  readonly naturalFrequency?: number;
  /** Damping ratio of the chassis suspension oscillations (0.7 - 0.9 = realistic rally damping) */
  readonly dampingRatio?: number;
  /** Heave displacement multiplier on bumps/crest landings (default ~0.5) */
  readonly heaveMultiplier?: number;
}

/**
 * Physical mass distribution and engine placement configuration.
 */
export interface WeightDistributionConfig {
  /**
   * Proportion of vehicle chassis mass concentrated in the front engine block (0.0 to 1.0).
   * In front-engine rally cars, typically 0.52 to 0.58.
   */
  readonly frontBias: number;
  /**
   * Longitudinal Z offset (in meters) of the engine mass center relative to chassis geometric center.
   * Positive value places the engine ahead of chassis center over/behind the front axle.
   */
  readonly engineOffsetZ: number;
  /**
   * Vertical Y offset (in meters) of the engine mass center relative to chassis geometric center.
   * Typically negative (e.g. -0.18m) to reflect a low center of gravity.
   */
  readonly engineOffsetY?: number;
  /**
   * Longitudinal Z offset (in meters) of the overall vehicle center of mass.
   * Positive value places CoM slightly ahead of geometric center (e.g. +0.08m)
   * to provide realistic ~53/47 rally front-engine weight balance.
   */
  readonly centerOfMassZ?: number;
  /**
   * Vertical Y offset (in meters) of the overall vehicle center of mass relative to chassis origin.
   * Typically negative (e.g. -0.38m to -0.42m) to reflect a low center of gravity (~0.35m above ground).
   */
  readonly centerOfMassY?: number;
}

/**
 * Configuration for tire grip on different surfaces.
 */
export interface TireGripCurve {
  /** Base grip level before peak slip angle */
  readonly baseGrip: number;
  /** The slip angle (radians) at which grip is highest */
  readonly peakSlipAngle: number;
  /** Grip level after exceeding peak slip angle (sliding) */
  readonly slideGrip: number;
}

export interface TireConfig {
  /** Grip curve for the front wheels */
  readonly front: TireGripCurve;
  /** Grip curve for the rear wheels */
  readonly rear: TireGripCurve;
}

/**
 * Handling and steering configuration
 */
export interface HandlingConfig {
  /** 
   * Steering curve mapping speed (km/h) to max steering angle (radians).
   * Example: [[0, Math.PI / 4], [100, Math.PI / 8]]
   */
  readonly steeringCurve: readonly [number, number][];
  /** Steering speed (how fast the wheel turns) */
  readonly steeringSpeed: number;
  /** Arcade assists configuration */
  readonly assists: {
    /** How much the game helps to keep the car straight when sliding */
    readonly yawDamping: number;
    /** Grip multiplier applied to rear wheels during handbrake */
    readonly driftGripMultiplier: number;
  };
}

/**
 * Aerodynamics configuration
 */
export interface AerodynamicsConfig {
  /** Downforce coefficient to keep the car glued to the ground at high speeds */
  readonly downforceFactor: number;
  /** Drag coefficient (Cd), typical rally car ~0.45 to 0.55 (default: 0.48) */
  readonly dragCoefficient?: number;
  /** Frontal cross-sectional area (m^2), typical rally car ~1.8 to 2.2 m^2 (default: 2.0) */
  readonly frontalArea?: number;
  /** Optional direct aerodynamic drag multiplier to fine-tune high-speed resistance (default: 1.0) */
  readonly dragMultiplier?: number;
}

/**
 * Full vehicle configuration — physics and visual parameters.
 */
export interface VehicleConfig {
  /** Mass of the chassis in kg */
  readonly chassisMass: number;
  /** Chassis dimensions [width, height, length] */
  readonly chassisSize: Vector3Tuple;
  /** Optional physical mass distribution and engine placement */
  readonly weightDistribution?: WeightDistributionConfig;
  
  readonly engine: EngineConfig;
  readonly drivetrain: DrivetrainConfig;
  readonly brakes: BrakesConfig;
  readonly suspension: SuspensionConfig;
  readonly handling: HandlingConfig;
  readonly aerodynamics: AerodynamicsConfig;
  readonly chassisDynamics?: ChassisDynamicsConfig;
  readonly wheels: readonly [WheelInfo, WheelInfo, WheelInfo, WheelInfo];
  /**
   * Optional per-vehicle balance overrides for fine-tuning specific handling archetypes
   * (e.g. drift car with higher yaw ceiling, heavy 4x4 with boosted ARB).
   * Safely merged with DRIVING_MODEL_BALANCE at runtime via resolveVehicleBalance().
   */
  readonly balanceOverrides?: VehicleBalanceOverrides;
}

/**
 * Recursive partial type for nested configuration objects.
 */
export type DeepPartial<T> = {
  readonly [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Strongly-typed balance overrides matching the sections of DrivingModelBalance.
 */
export interface VehicleBalanceOverrides {
  readonly handbrake?: Partial<{
    readonly minLockupBrakeForce: number;
    readonly rearLockupImpulseMultiplier: number;
    readonly frontSteerYieldMultiplier: number;
    readonly disableAwdPropulsion: boolean;
    readonly rollDampingBoost: number;
    readonly maxYawRateCeiling: number;
    readonly yawExcessDampingGain: number;
  }>;
  readonly suspension?: Partial<{
    readonly antiRollBarMassScale: number;
    readonly antiSquatMassScale: number;
    readonly pitchDampingMassScale: number;
    readonly maxRestoringPitchTorqueG: number;
    readonly antiWheeliePitchMultiplier: number;
  }>;
  readonly drivetrain?: Partial<{
    readonly launchRampEndSpeedMps: number;
    readonly launchRampBaseFraction: number;
    readonly gear2TorquePunch: number;
    readonly driftBoostSteerWeight: number;
    readonly driftBoostSlipWeight: number;
    readonly frontUnweightedDampingThreshold: number;
    readonly driftPropulsionMultiplier?: number;
    readonly driftSteeredPullRatio?: number;
    readonly driftTargetSpeedKmh?: number;
    readonly dccdMinFrontBias?: number;
    readonly dccdDriftFrontBias?: number;
    readonly dccdIntensityDecayRate?: number;
    readonly rearSpoolLockRatio?: number;
  }>;
  readonly assists?: Partial<{
    readonly turnInTorqueGain: number;
    readonly countersteerDampingBase: number;
    readonly rollDampingNormal: number;
    readonly steerAssistDeadzone: number;
    readonly pitchDampingThrottleUp: number;
    readonly pitchDampingNormal: number;
    readonly virtualCasterAuthority?: number;
    readonly virtualCasterMinSlipAngle?: number;
    readonly flickAttenuationGain?: number;
    readonly autoCounterSteerBias?: number;
  }>;
  readonly tires?: Partial<{
    readonly minPowerSlideSlipAngle: number;
    readonly wheelspinFrictionDropFront: number;
    readonly wheelspinFrictionDropRear: number;
    readonly looseSurfaceFrontWeight: number;
    readonly looseSurfaceRearWeight: number;
    readonly looseSurfaceGripFloor?: number;
    readonly looseSurfaceShearScale?: number;
    readonly loadSensitivityFactor?: number;
    readonly frictionEllipseCoupling?: number;
    readonly rearOversteerLateralBias?: number;
    readonly lowSpeedViscousBlend?: number;
  }>;
}

/**
 * Surface types present on the terrain.
 */
export type SurfaceType = 'tarmac' | 'mud' | 'grass' | 'sand' | 'snow' | 'gravel';

/**
 * Available tire compound types for vehicles in OpenRally.
 * Restricted to exactly 3 distinct compounds:
 * - 'asphalt': Tarmac-optimized high-grip compound
 * - 'gravel': Deep-tread loose surface rally compound
 * - 'snow': Siped winter compound for snow and ice
 */
export type TireType = 'asphalt' | 'gravel' | 'snow';

/**
 * Display category for vehicle selection.
 */
export type VehicleCategory = 'rally' | 'sports' | 'offroad' | 'arcade';

/**
 * Normalized 1-10 stats for UI gauges in garage/menu.
 */
export interface VehicleStats {
  /** Top speed rating (1-10) */
  readonly topSpeed: number;
  /** Acceleration rating (1-10) */
  readonly acceleration: number;
  /** Handling / agility rating (1-10) */
  readonly handling: number;
  /** Offroad capability rating (1-10) */
  readonly offroad: number;
  /** Drivetrain label (e.g. 'AWD', 'RWD', 'FWD') */
  readonly driveType: 'AWD' | 'RWD' | 'FWD';
}

/**
 * Complete vehicle preset metadata and physical configuration.
 */
export interface VehiclePreset {
  /** Unique vehicle identifier */
  readonly id: string;
  /** Display name shown in UI */
  readonly name: string;
  /** Short description / flavor text */
  readonly description: string;
  /** Vehicle category */
  readonly category: VehicleCategory;
  /** Path to primary chassis 3D GLB model */
  readonly modelPath: string;
  /** Optional custom wheel 3D GLB model path */
  readonly wheelModelPath?: string;
  /** Visual scale factor for chassis model */
  readonly modelScale?: Vector3Tuple;
  /** Visual offset position [x, y, z] for chassis model */
  readonly modelPositionOffset?: Vector3Tuple;
  /** Visual rotation offset [x, y, z] in radians for chassis model */
  readonly modelRotationOffset?: Vector3Tuple;
  /** Optional custom path to optimized mobile/web GLB model */
  readonly optimizedModelPath?: string;
  /** Normalized UI stats */
  readonly stats: VehicleStats;
  /** Full physics and dynamics configuration */
  readonly config: VehicleConfig;
}

/**
 * Interface representing the Rapier DynamicRayCastVehicleController methods
 * used by vehicle physics calculations and visual synchronization.
 */
export interface IRapierVehicleController {
  setWheelEngineForce(wheelIndex: number, force: number): void;
  setWheelBrake(wheelIndex: number, brake: number): void;
  setWheelSteering(wheelIndex: number, steering: number): void;
  setWheelFrictionSlip(wheelIndex: number, friction: number): void;
  wheelSuspensionLength(wheelIndex: number): number | null | undefined;
  wheelChassisConnectionPointCs(wheelIndex: number): { x: number; y: number; z: number } | null | undefined;
  wheelSteering(wheelIndex: number): number | null | undefined;
  wheelIsInContact?(wheelIndex: number): boolean | null | undefined;
  setWheelMaxSuspensionTravel?(wheelIndex: number, travel: number): void;
  setWheelSuspensionStiffness?(wheelIndex: number, stiffness: number): void;
  setWheelSuspensionCompression?(wheelIndex: number, compression: number): void;
  setWheelSuspensionRelaxation?(wheelIndex: number, relaxation: number): void;
  setWheelMaxSuspensionForce?(wheelIndex: number, maxForce: number): void;
  setWheelSideFrictionStiffness?(wheelIndex: number, stiffness: number): void;
  wheelSideFrictionStiffness?(wheelIndex: number): number | null | undefined;
}


