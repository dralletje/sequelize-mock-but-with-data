let { cloneDeepWith } = require('lodash');

// Epic graphql property type checking idk
let known = object => {
	return new Proxy(object, {
    // set() {
    //   throw new Error(`Object is readonly`);
    // },
		get(target, property, receiver) {
			if (!(property in target) && typeof property !== 'symbol') {
        if (property === 'then') {
          return undefined;
        }

        let stack = (new Error()).stack;
        let [error, first_trace, second_trace, ...other_traces] = stack.split('\n');
        if (second_trace.includes('node_modules') || !second_trace.includes(process.cwd())) {
          // Fine
        } else {
          throw new TypeError(`Unknown property: ${property}`);
        }
			}
			return Reflect.get(target, property, receiver);
		}
	});
};
let recursive_known = (value) => {
  if (value == null) {
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }

  return known(cloneDeepWith(value, (sub_value, sub_key) => {
    if (sub_key === undefined) {
      return undefined;
    } else {
      return recursive_known(sub_value)
    }
  }));
}

known.recursive = recursive_known;
module.exports = known;
