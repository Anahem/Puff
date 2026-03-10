/**
 * Converts a raw activity row into a human-readable { type, headline, detail }.
 *
 * type:     'joints' | 'expense' | 'member' | 'session'
 * headline: short plain-English sentence
 * detail:   supporting info (or null)
 */
module.exports = function formatActivity(a) {
  const name = a.member_name;
  const prev = a.previous_value;
  const next = a.new_value;

  switch (a.action) {

    case 'log_joint': {
      if (next === 'Solo') {
        return {
          type:     'joints',
          headline: `${name} smoked a solo joint`,
          detail:   null,
        };
      }
      const match = next.match(/\((\d+) people\)/);
      const n = match ? match[1] : '?';
      return {
        type:     'joints',
        headline: `Joint shared between ${n} people`,
        detail:   name, // participant names
      };
    }

    case 'increment_joints':
      return {
        type:     'joints',
        headline: `${name} smoked a joint`,
        detail:   `${prev} → ${next} joints`,
      };

    case 'decrement_joints':
      return {
        type:     'joints',
        headline: `${name}'s joint was removed`,
        detail:   `${prev} → ${next} joints`,
      };

    case 'bulk_add_joints': {
      const diff = parseFloat((parseFloat(next) - parseFloat(prev)).toFixed(4));
      return {
        type:     'joints',
        headline: `${name} added ${diff} joint${diff !== 1 ? 's' : ''} in bulk`,
        detail:   `${prev} → ${next} joints total`,
      };
    }

    case 'bulk_subtract_joints': {
      const diff = parseFloat((parseFloat(prev) - parseFloat(next)).toFixed(4));
      return {
        type:     'joints',
        headline: `${name} had ${diff} joint${diff !== 1 ? 's' : ''} removed`,
        detail:   `${prev} → ${next} joints total`,
      };
    }

    case 'add_member':
      return {
        type:     'member',
        headline: `${name} joined the squad`,
        detail:   null,
      };

    case 'delete_member':
      return {
        type:     'member',
        headline: `${prev} was removed from the squad`,
        detail:   null,
      };

    case 'add_expense':
      return {
        type:     'expense',
        headline: `${name} logged an expense`,
        detail:   next, // already formatted: "£20.00 for ganja (memo)"
      };

    case 'close_session':
      return {
        type:     'session',
        headline: 'Session closed and archived',
        detail:   null,
      };

    case 'socialise_guest': {
      if (name === 'System') {
        return {
          type:     'member',
          headline: `Guest balance socialised — ${prev}`,
          detail:   next, // "Split: Damien 33.3%, ..."
        };
      }
      const diff = parseFloat((parseFloat(next) - parseFloat(prev)).toFixed(4));
      return {
        type:     'joints',
        headline: `${name} received ${diff} joint${diff !== 1 ? 's' : ''} from guest`,
        detail:   `${parseFloat(parseFloat(prev).toFixed(2))} → ${parseFloat(parseFloat(next).toFixed(2))} joints`,
      };
    }

    case 'update_amount':
      return {
        type:     'member',
        headline: `${name}'s balance was manually adjusted`,
        detail:   `${prev} → ${next}`,
      };

    default:
      return {
        type:     'other',
        headline: `${name} — ${a.action.replace(/_/g, ' ')}`,
        detail:   next || null,
      };
  }
};
