import {
  SET_REACT_SPIN,
  SET_REACT,
  SET_REDUX_SPIN,
  SET_REDUX
} from './constants';

import initStore from './initStore';

export default function update(state = initStore(), action) {
  switch(action.type) {
    case SET_REACT_SPIN: {
      return {
        ...state,
        React: {
          start: 0,
          spin: true
        },
        Redux: {
          start: 0,
          spin: false
        }
      };
    }
    case SET_REACT: {
      return {
        ...state,
        React: {
          start: action.payload,
          spin: false
        }
      };
    }
    case SET_REDUX_SPIN: {
      return {
        ...state,
        React: {
          start: 0,
          spin: false,
        },
        Redux: {
          start: 0,
          spin: true
        }
      };
    }
    case SET_REDUX: {
      return {
        ...state,
        Redux: {
          start: action.payload,
          spin: false
        }
      };
    }
    default: {
      //
    }
  }

  return state;
}
