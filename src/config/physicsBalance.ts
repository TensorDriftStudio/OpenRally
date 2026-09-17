/**
 * OpenRally — Driving Model Balance & Tuning Parameters
 * 
 * Centralized, strongly-typed source of truth for driving dynamics, traction,
 * suspension weight transfer, stability assists, and handbrake behavior.
 * 
 * AI TUNING GUIDE:
 * - Modify parameters in this file to adjust global vehicle handling characteristics.
 * - Each parameter contains an explicit Safe Range and physical description.
 * - All parameters are validated at runtime via validateDrivingModelBalance().
 */

export interface HandbrakeBalanceConfig {
  /**
   * Minimum braking impulse (N·s) applied to rear wheels when handbrake is engaged.
   * Guarantees 100% mechanical lockup of rear calipers against ground friction torque.
   * Safe Range: 120.0 to 300.0 (default: 160.0)
   */
  readonly minLockupBrakeForce: number;

  /**
   * Multiplier applied to vehicle's base brakes.handbrakeForce.
   * Ensures instant lockup on heavier vehicles with higher inertia.
   * Safe Range: 2.0 to 6.0 (default: 4.0)
   */
  readonly rearLockupImpulseMultiplier: number;

  /**
   * Lateral friction scalar for front steerable wheels during handbrake engagement.
   * A value < 1.0 allows front tires to yield slightly during high-lateral-G handbrake
   * turns, preventing the front outside tire from acting as a tripping fulcrum that flips the car.
   * Safe Range: 0.80 to 0.95 (default: 0.88)
   */
  readonly frontSteerYieldMultiplier: number;

  /**
   * Whether to disable artificial AWD forward body thrust during active handbrake engagement.
   * Must be true so AWD propulsion does not fight handbrake pivot maneuvers.
   */
  readonly disableAwdPropulsion: boolean;

  /**
   * Multiplier for roll velocity damping around local Z axis when handbrake is held.
   * Quells aggressive roll oscillations when snapping into handbrake hairpins.
   * Safe Range: 1.5 to 3.0 (default: 2.2)
   */
  readonly rollDampingBoost: number;

  /**
   * Maximum yaw velocity (rad/s) permitted during a handbrake slide before
   * progressive stabilizing damping engages to prevent uncontrollable centrifuge spins.
   * Safe Range: 2.0 to 3.2 (default: 2.4 rad/s ≈ 137 deg/s)
   */
  readonly maxYawRateCeiling: number;

  /**
   * Damping gain applied to excess yaw velocity above maxYawRateCeiling.
   * Safe Range: 0.8 to 2.5 (default: 1.5)
   */
  readonly yawExcessDampingGain: number;
}

export interface SuspensionBalanceConfig {
  /**
   * Coefficient scaling Anti-Roll Bar (ARB) lateral weight transfer force by vehicle mass.
   * antiRollForce = compressionDelta * stiffness * mass * antiRollBarMassScale
   * Pushes compressed outside wheel UP and lifted inside wheel DOWN to keep car level in turns.
   * Safe Range: 0.15 to 0.40 (default: 0.25)
   */
  readonly antiRollBarMassScale: number;

  /**
   * Coefficient scaling anti-squat / anti-dive pitch restoring torque by vehicle mass.
   * Safe Range: 0.20 to 0.60 (default: 0.42)
   */
  readonly antiSquatMassScale: number;

  /**
   * Damping factor opposing dynamic pitch velocity (_localAngVel.x) scaled by mass.
   * Absorbs landing impacts and crest oscillations without bucking.
   * Safe Range: 4.5 to 10.0 (default: 7.5)
   */
  readonly pitchDampingMassScale: number;

  /**
   * Saturation ceiling for static pitch restoring torque (expressed in Gs of vehicle mass).
   * Prevents sharp bumps and terrain berms from jerking the chassis.
   * Safe Range: 3.0 to 14.0 G (default: 10.5 G)
   */
  readonly maxRestoringPitchTorqueG: number;

  /**
   * Progressive torque gain applied to plant front axle when front suspension is unweighted.
   * Safe Range: 4.0 to 16.0 (default: 10.0)
   */
  readonly antiWheeliePitchMultiplier: number;
}

export interface DrivetrainBalanceConfig {
  /**
   * Forward ground speed (m/s) up to which launch torque in 1st gear is progressively ramped.
   * Simulates clutch engagement and turbo spool from dead stop, preventing front-axle lift.
   * Safe Range: 2.0 to 6.0 m/s (~7 to 22 km/h, default: 4.2 m/s)
   */
  readonly launchRampEndSpeedMps: number;

  /**
   * Initial launch torque fraction at 0 m/s standing start (ramps to 1.0 at launchRampEndSpeedMps).
   * Safe Range: 0.50 to 0.85 (default: 0.60)
   */
  readonly launchRampBaseFraction: number;

  /**
   * Mid-range torque multiplier in 2nd gear (30–80 km/h) for snappy corner exits and power slides.
   * Safe Range: 1.00 to 1.20 (default: 1.08)
   */
  readonly gear2TorquePunch: number;

  /**
   * Additional AWD tractive power factor per unit of steering input during cornering throttle.
   * Overcomes lateral tire scrub friction so the car powers dynamically through turns.
   * Safe Range: 0.20 to 0.50 (default: 0.35)
   */
  readonly driftBoostSteerWeight: number;

  /**
   * Additional AWD tractive power factor per unit of normalized drift slip angle.
   * Safe Range: 0.40 to 1.10 (default: 0.75)
   */
  readonly driftBoostSlipWeight: number;

  /**
   * Front suspension compression threshold below which rear wheel drive torque is moderated
   * to simulate active center differential / traction control and prevent launch wheelies.
   * Safe Range: 0.02 to 0.08 m (default: 0.045 m)
   */
  readonly frontUnweightedDampingThreshold: number;

  /**
   * AWD tractive drift propulsion multiplier to compensate for lateral tire scrub drag during slides.
   * Allows throttle to sustain or increase vehicle velocity while sliding rather than bleeding all momentum.
   * Safe Range: 0.5 to 3.0 (default: 1.15)
   */
  readonly driftPropulsionMultiplier: number;

  /**
   * Fraction of AWD drift tractive propulsion directed through steered front wheels during countersteer.
   * Safe Range: 0.0 to 0.70 (default: 0.0 for pure natural forward chassis propulsion)
   */
  readonly driftSteeredPullRatio: number;

  /**
   * Target equilibrium drift speed (km/h) sustained under full throttle during power slides.
   * At speeds below this target, full tractive support maintains drift momentum; at higher speeds,
   * natural tire scrub realistically bleeds speed down to this equilibrium.
   * Safe Range: 50 to 100 km/h (default: 75 km/h)
   */
  readonly driftTargetSpeedKmh: number;

  /**
   * DCCD baseline front torque distribution during straight-line driving and grip cornering.
   * Safe Range: 0.30 to 0.55 (default: 0.45 = 45% front / 55% rear)
   */
  readonly dccdMinFrontBias: number;

  /**
   * DCCD active front torque distribution during high-angle throttle power-slides.
   * Safe Range: 0.25 to 0.50 (default: 0.36 = 36% front / 64% rear)
   */
  readonly dccdDriftFrontBias: number;

  /**
   * Rate (1/s) at which the filtered drift intensity decays when exiting a drift (~0.25s hold buffer).
   * Safe Range: 1.0 to 10.0 (default: 4.0)
   */
  readonly dccdIntensityDecayRate: number;

  /**
   * Mechanical spool lock ratio across rear driven wheels under throttle during a slide.
   * Safe Range: 0.50 to 1.0 (default: 0.85)
   */
  readonly rearSpoolLockRatio: number;
}

export interface AssistsBalanceConfig {
  /**
   * Progressive turn-in torque gain assisting initial sharp corner entry from straight line.
   * Only active when yaw velocity is near zero (|yaw| < 0.65 rad/s).
   * Safe Range: 0.15 to 0.50 (default: 0.32)
   */
  readonly turnInTorqueGain: number;

  /**
   * Base damping coefficient opposing active slide yaw velocity when driver countersteers.
   * Decays smoothly to zero as the car straightens out, preventing tank-slapper rebounds.
   * Safe Range: 0.40 to 0.85 (default: 0.60)
   */
  readonly countersteerDampingBase: number;

  /**
   * Baseline roll velocity damping around local Z axis during normal driving.
   * Damps high-frequency chassis wobble without restricting 360° rolls on ramps/cliffs.
   * Safe Range: 0.5 to 1.4 (default: 0.8)
   */
  readonly rollDampingNormal: number;

  /**
   * Deadzone for steering input below which steering assist is considered neutral/centered.
   * Safe Range: 0.01 to 0.05 (default: 0.02)
   */
  readonly steerAssistDeadzone: number;

  /**
   * Pitch velocity damping multiplier when accelerating with front end lifting.
   * Suppresses power wheelies and front axle float under launch/boost.
   * Safe Range: 3.0 to 8.0 (default: 5.5)
   */
  readonly pitchDampingThrottleUp: number;

  /**
   * Baseline pitch velocity damping multiplier under braking or deceleration.
   * Safe Range: 1.5 to 5.0 (default: 3.0)
   */
  readonly pitchDampingNormal: number;

  /**
   * Virtual caster steering assist authority (blends steered wheel angle towards velocity vector during slide).
   * Safe Range: 0.0 to 0.70 (default: 0.35)
   */
  readonly virtualCasterAuthority: number;

  /**
   * Minimum slip angle (radians) before virtual caster steering assist engages.
   * Safe Range: 0.02 to 0.12 (default: 0.05 rad ≈ 2.9 degrees)
   */
  readonly virtualCasterMinSlipAngle: number;

  /**
   * Gain attenuating yaw damping during high-velocity driver steering flicks (Scandinavian flick / turn-in).
   * Safe Range: 0.0 to 0.60 (default: 0.25)
   */
  readonly flickAttenuationGain: number;

  /**
   * Proportional counter-steer assist bias blended during steady high-angle slides.
   * Safe Range: 0.0 to 0.60 (default: 0.38)
   */
  readonly autoCounterSteerBias: number;
}

export interface TiresBalanceConfig {
  /**
   * Minimum slip angle (radians) required before high-angle power-slide wheelspin relaxation engages.
   * In normal cornering below this angle, tires retain 100% grip.
   * Safe Range: 0.18 to 0.32 rad (default: 0.25 rad ≈ 14.3 degrees)
   */
  readonly minPowerSlideSlipAngle: number;

  /**
   * Friction drop on front wheels during high-angle power-slide wheelspin.
   * Safe Range: 0.01 to 0.06 (default: 0.02)
   */
  readonly wheelspinFrictionDropFront: number;

  /**
   * Friction drop on rear wheels during high-angle power-slide wheelspin.
   * Safe Range: 0.04 to 0.15 (default: 0.10)
   */
  readonly wheelspinFrictionDropRear: number;

  /**
   * Weight of loose surface traction loss on front steerable wheels under throttle.
   * Safe Range: 0.35 to 0.65 (default: 0.45)
   */
  readonly looseSurfaceFrontWeight: number;

  /**
   * Weight of loose surface traction loss on rear driven wheels under throttle.
   * Safe Range: 0.60 to 0.90 (default: 0.78)
   */
  readonly looseSurfaceRearWeight: number;

  /**
   * Minimum friction retention floor on loose surfaces under throttle churn.
   * Prevents friction slip from collapsing and keeps residual lateral drift grip.
   * Safe Range: 0.65 to 0.90 (default: 0.80)
   */
  readonly looseSurfaceGripFloor: number;

  /**
   * Multiplier scaling the loose surface continuous particle shearing loss.
   * Safe Range: 0.10 to 0.50 (default: 0.25)
   */
  readonly looseSurfaceShearScale: number;

  /**
   * Normal load sensitivity coefficient scaling de-gressive tire friction with vertical load Fz.
   * Safe Range: 0.0 to 0.30 (default: 0.12)
   */
  readonly loadSensitivityFactor: number;

  /**
   * Friction ellipse coupling factor moderating lateral grip compliance during heavy drive/brake slip.
   * Safe Range: 0.0 to 1.0 (default: 0.85)
   */
  readonly frictionEllipseCoupling: number;

  /**
   * Lateral grip scalar on rear driven wheels during high-throttle power slides to promote controllable oversteer.
   * Safe Range: 0.85 to 1.0 (default: 0.94)
   */
  readonly rearOversteerLateralBias: number;

  /**
   * Forward ground speed threshold (m/s) below which low-speed restoring viscous damping stabilizes the vehicle.
   * Safe Range: 0.5 to 3.0 (default: 1.2 m/s)
   */
  readonly lowSpeedViscousBlend: number;
}

export interface DrivingModelBalance {
  readonly handbrake: HandbrakeBalanceConfig;
  readonly suspension: SuspensionBalanceConfig;
  readonly drivetrain: DrivetrainBalanceConfig;
  readonly assists: AssistsBalanceConfig;
  readonly tires: TiresBalanceConfig;
}

/**
 * Global Driving Model Balance Profile for OpenRally.
 * 
 * Edit parameters here to fine-tune arcade-sim vehicle physics globally.
 */
export const DRIVING_MODEL_BALANCE: DrivingModelBalance = {
  handbrake: {
    minLockupBrakeForce: 160.0,
    rearLockupImpulseMultiplier: 4.0,
    frontSteerYieldMultiplier: 0.88,
    disableAwdPropulsion: true,
    rollDampingBoost: 2.2,
    maxYawRateCeiling: 2.4,
    yawExcessDampingGain: 1.5,
  },
  suspension: {
    antiRollBarMassScale: 0.25,
    antiSquatMassScale: 0.42,
    pitchDampingMassScale: 7.5,
    maxRestoringPitchTorqueG: 3.8,
    antiWheeliePitchMultiplier: 12.0,
  },
  drivetrain: {
    launchRampEndSpeedMps: 4.2,
    launchRampBaseFraction: 0.60,
    gear2TorquePunch: 1.08,
    driftBoostSteerWeight: 0.35,
    driftBoostSlipWeight: 0.75,
    frontUnweightedDampingThreshold: 0.045,
    driftPropulsionMultiplier: 1.15,
    driftSteeredPullRatio: 0.0,
    driftTargetSpeedKmh: 75,
    dccdMinFrontBias: 0.35,
    dccdDriftFrontBias: 0.48,
    dccdIntensityDecayRate: 4.0,
    rearSpoolLockRatio: 0.90,
  },
  assists: {
    turnInTorqueGain: 0.22,
    countersteerDampingBase: 0.85,
    rollDampingNormal: 0.8,
    steerAssistDeadzone: 0.02,
    pitchDampingThrottleUp: 5.5,
    pitchDampingNormal: 3.0,
    virtualCasterAuthority: 0.35,
    virtualCasterMinSlipAngle: 0.05,
    flickAttenuationGain: 0.25,
    autoCounterSteerBias: 0.38,
  },
  tires: {
    minPowerSlideSlipAngle: 0.25,
    wheelspinFrictionDropFront: 0.03,
    wheelspinFrictionDropRear: 0.05,
    looseSurfaceFrontWeight: 0.56,
    looseSurfaceRearWeight: 0.60,
    looseSurfaceGripFloor: 0.80,
    looseSurfaceShearScale: 0.25,
    loadSensitivityFactor: 0.12,
    frictionEllipseCoupling: 0.85,
    rearOversteerLateralBias: 0.88,
    lowSpeedViscousBlend: 1.2,
  },
};

import type { VehicleConfig, VehicleBalanceOverrides } from '@/types/vehicle';
import { validateDrivingModelBalance } from '@/utils/validation/physicsBalanceValidator';

const _balanceCache = new WeakMap<VehicleConfig, DrivingModelBalance>();

/**
 * Resolves the effective DrivingModelBalance for a vehicle configuration.
 * Seamlessly merges vehicle-specific balanceOverrides onto global DRIVING_MODEL_BALANCE.
 * Caches the resolved immutable profile in a WeakMap for zero-allocation hot-loop performance.
 * 
 * If balanceOverrides are invalid according to validateDrivingModelBalance(),
 * logs a warning and gracefully degrades to DRIVING_MODEL_BALANCE.
 */
export function resolveVehicleBalance(config?: VehicleConfig): DrivingModelBalance {
  if (!config || !config.balanceOverrides) {
    return DRIVING_MODEL_BALANCE;
  }

  const cached = _balanceCache.get(config);
  if (cached) {
    return cached;
  }

  const overrides = config.balanceOverrides;
  const resolved: DrivingModelBalance = {
    handbrake: {
      ...DRIVING_MODEL_BALANCE.handbrake,
      ...(overrides.handbrake ?? {}),
    },
    suspension: {
      ...DRIVING_MODEL_BALANCE.suspension,
      ...(overrides.suspension ?? {}),
    },
    drivetrain: {
      ...DRIVING_MODEL_BALANCE.drivetrain,
      ...(overrides.drivetrain ?? {}),
    },
    assists: {
      ...DRIVING_MODEL_BALANCE.assists,
      ...(overrides.assists ?? {}),
    },
    tires: {
      ...DRIVING_MODEL_BALANCE.tires,
      ...(overrides.tires ?? {}),
    },
  };

  const validation = validateDrivingModelBalance(resolved);
  if (!validation.valid) {
    console.warn(
      `[resolveVehicleBalance] Invalid balance overrides detected: ${validation.errors.join('; ')}. Falling back to DRIVING_MODEL_BALANCE.`,
    );
    _balanceCache.set(config, DRIVING_MODEL_BALANCE);
    return DRIVING_MODEL_BALANCE;
  }

  _balanceCache.set(config, resolved);
  return resolved;
}

/**
 * Helper to define type-safe balance overrides for a vehicle with auto-completion.
 */
export function defineBalanceOverrides(overrides: VehicleBalanceOverrides): VehicleBalanceOverrides {
  return overrides;
}
