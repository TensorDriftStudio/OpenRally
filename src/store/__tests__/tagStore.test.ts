import { describe, it, expect, beforeEach } from 'vitest';
import { useTagStore } from '../tagStore';
import { useMultiplayerStore } from '../multiplayerStore';

describe('tagStore', () => {
  beforeEach(() => {
    useTagStore.getState().reset();
    useMultiplayerStore.setState({
      selfId: 'player_self',
      nickname: 'ApexDriver',
      remotePlayers: {
        player_remote1: {
          id: 'player_remote1',
          nickname: 'RacerOne',
          vehicleId: 'apex_rally_awd',
          slotIndex: 1,
          ping: 25,
        },
      },
    });
  });

  it('initializes with default waiting state', () => {
    const state = useTagStore.getState();
    expect(state.phase).toBe('waiting');
    expect(state.countdownRemaining).toBe(0);
    expect(state.roundRemaining).toBe(180);
    expect(state.isTagger).toBe(false);
    expect(state.taggerId).toBeNull();
    expect(state.isFrozen).toBe(false);
    expect(state.showResultsModal).toBe(false);
    expect(state.timeClean).toBe(0);
    expect(state.tagsMade).toBe(0);
  });

  it('handles countdown state and assigned spawn slot', () => {
    useTagStore.getState().setCountdown(15, 3);
    const state = useTagStore.getState();
    expect(state.phase).toBe('countdown');
    expect(state.countdownRemaining).toBe(15);
    expect(state.assignedSpawnIndex).toBe(3);
  });

  it('starts match with self as tagger', () => {
    useTagStore.getState().startMatch(180, 'player_self', 2);
    const state = useTagStore.getState();
    expect(state.phase).toBe('active');
    expect(state.roundRemaining).toBe(180);
    expect(state.isTagger).toBe(true);
    expect(state.taggerId).toBe('player_self');
    expect(state.taggerNickname).toBe('ApexDriver');
    expect(state.isFrozen).toBe(false);
  });

  it('starts match with remote player as tagger', () => {
    useTagStore.getState().startMatch(180, 'player_remote1', 1);
    const state = useTagStore.getState();
    expect(state.phase).toBe('active');
    expect(state.isTagger).toBe(false);
    expect(state.taggerId).toBe('player_remote1');
    expect(state.taggerNickname).toBe('RacerOne');
  });

  it('handles passing tag to self with immobilization freeze', () => {
    useTagStore.getState().startMatch(180, 'player_remote1', 1);
    expect(useTagStore.getState().isTagger).toBe(false);

    // Tag passed from remote1 to self with 2500ms freeze
    useTagStore.getState().setTagPassed('player_remote1', 'player_self', 2500);

    const state = useTagStore.getState();
    expect(state.isTagger).toBe(true);
    expect(state.taggerId).toBe('player_self');
    expect(state.isFrozen).toBe(true);
    expect(state.freezeRemaining).toBe(2.5);
  });

  it('handles passing tag from self to remote with anti-tag-back immunity', () => {
    useTagStore.getState().startMatch(180, 'player_self', 0);
    expect(useTagStore.getState().isTagger).toBe(true);

    // Tag passed from self to remote1
    useTagStore.getState().setTagPassed('player_self', 'player_remote1', 2500);

    const state = useTagStore.getState();
    expect(state.isTagger).toBe(false);
    expect(state.taggerId).toBe('player_remote1');
    expect(state.isFrozen).toBe(false);
    expect(state.immunityRemaining).toBe(3.0);
    expect(state.tagsMade).toBe(1);
  });

  it('decrements freeze and immunity during tickDelta', () => {
    useTagStore.getState().startMatch(180, 'player_remote1', 1);
    useTagStore.getState().setTagPassed('player_remote1', 'player_self', 2000);

    expect(useTagStore.getState().isFrozen).toBe(true);
    expect(useTagStore.getState().freezeRemaining).toBe(2.0);

    // Tick 1.0s
    useTagStore.getState().tickDelta(1.0);
    expect(useTagStore.getState().freezeRemaining).toBe(1.0);
    expect(useTagStore.getState().isFrozen).toBe(true);

    // Tick another 1.2s -> freeze expires
    useTagStore.getState().tickDelta(1.2);
    expect(useTagStore.getState().freezeRemaining).toBe(0);
    expect(useTagStore.getState().isFrozen).toBe(false);
  });

  it('ends match and displays results modal with leaderboard', () => {
    const mockLeaderboard = [
      {
        id: 'player_self',
        nickname: 'ApexDriver',
        vehicleId: 'apex_rally_awd',
        timeClean: 150,
        tagsMade: 1,
      },
      {
        id: 'player_remote1',
        nickname: 'RacerOne',
        vehicleId: 'apex_rally_awd',
        timeClean: 30,
        tagsMade: 1,
      },
    ];

    useTagStore.getState().endMatch(20, mockLeaderboard);

    const state = useTagStore.getState();
    expect(state.phase).toBe('intermission');
    expect(state.intermissionRemaining).toBe(20);
    expect(state.showResultsModal).toBe(true);
    expect(state.leaderboard).toEqual(mockLeaderboard);

    useTagStore.getState().dismissResultsModal();
    expect(useTagStore.getState().showResultsModal).toBe(false);
  });

  it('accurately counts down roundRemaining and accumulates cleanTime during active match', () => {
    // Player is runner (not tagger)
    useTagStore.getState().startMatch(180, 'player_remote1', 0);
    expect(useTagStore.getState().roundRemaining).toBe(180);
    expect(useTagStore.getState().timeClean).toBe(0);
    expect(useTagStore.getState().isTagger).toBe(false);

    // Tick 1.5s
    useTagStore.getState().tickDelta(1.5);
    expect(useTagStore.getState().roundRemaining).toBeCloseTo(178.5);
    expect(useTagStore.getState().timeClean).toBeCloseTo(1.5);

    // Tick another 0.5s via tickSecond
    useTagStore.getState().tickSecond();
    expect(useTagStore.getState().roundRemaining).toBeCloseTo(177.5);
    expect(useTagStore.getState().timeClean).toBeCloseTo(2.5);
  });

  it('does not accumulate cleanTime when player is the tagger', () => {
    // Player is the tagger
    useTagStore.getState().startMatch(180, 'player_self', 0);
    expect(useTagStore.getState().isTagger).toBe(true);
    expect(useTagStore.getState().timeClean).toBe(0);

    useTagStore.getState().tickDelta(3.0);
    expect(useTagStore.getState().roundRemaining).toBeCloseTo(177);
    expect(useTagStore.getState().timeClean).toBe(0);
  });

  it('decrements intermissionRemaining during intermission phase', () => {
    useTagStore.getState().endMatch(20, []);
    expect(useTagStore.getState().phase).toBe('intermission');
    expect(useTagStore.getState().intermissionRemaining).toBe(20);

    useTagStore.getState().tickDelta(2.5);
    expect(useTagStore.getState().intermissionRemaining).toBeCloseTo(17.5);
  });

  it('clamps roundRemaining to 0 when time expires', () => {
    useTagStore.getState().startMatch(1, 'player_remote1', 0);
    useTagStore.getState().tickDelta(2.0);
    expect(useTagStore.getState().roundRemaining).toBe(0);
  });
});

