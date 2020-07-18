let { isMatch, escapeRegExp } = require("lodash");

let precondition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

let SequelizeOp = {
  and: Symbol("Sequelize [and]"),
  or: Symbol("Sequelize [or]"),
  ne: Symbol("Sequelize [ne]"),
  in: Symbol("Sequelize [in]"),
  notIn: Symbol("Sequelize [notIn]"),
  between: Symbol("Sequelize [between]"),
  eq: Symbol("Sequelize [eq]"),
  gt: Symbol("Sequelize [gt]"),
  gte: Symbol("Sequelize [gte]"),
  lt: Symbol("Sequelize [lt]"),
  lte: Symbol("Sequelize [lte]"),
  contains: Symbol("Sequelize [contains]"),
  iLike: Symbol("Sequelize [iLike]"),
  like: Symbol("Sequelize [like]"),
};

let generate_like_regex = (pattern) => {
  return new RegExp(
    escapeRegExp(pattern).replace(/%/g, ".*").replace(/_/g, ".")
  );
};

// [] => []
// [1, 2, 3] => [1, 2, 3]
// {} => []
// { key: 'value' } => [{ key: 'value' }]
// { key1: 'value', key2: 'value' } => [{ key1: 'value' }, { key2: 'value' }];
let arrayisze_object = (array_or_object) => {
  if (Array.isArray(array_or_object)) {
    return array_or_object;
  } else {
    let symbols = Object.getOwnPropertySymbols(array_or_object);
    let keys = Object.keys(array_or_object);
    return [...symbols, ...keys].map((key) => {
      return { [key]: array_or_object[key] };
    });
  }
};

// { count: 10, age: { [Op.lt]: 18 } }
// - special_matchers(item.count, 10)
// - special_matchers(item.age, { [Op.iLike]: 18 })
let special_matchers = (item, matchobject) => {
  if (typeof matchobject !== "object") {
    return item === matchobject;
  }
  if (matchobject === null) {
    return item === matchobject;
  }

  return Object.getOwnPropertySymbols(matchobject).every((symbol) => {
    if (symbol === SequelizeOp.or) {
      let queries = matchobject[SequelizeOp.or];

      precondition(queries != null, `Value to [Op.or] is null or undefined`);

      if (Array.isArray(queries)) {
        if (queries.length === 0) {
          return true;
        } else {
          return queries.some((query) => {
            return special_matchers(item, query);
          });
        }
      } else {
        // console.warn(`I really think it is better to use [Or.or]: <array>`)
        return Object.getOwnPropertySymbols(queries).some((symbol) => {
          return special_matchers(item, { [symbol]: queries[symbol] });
        });
      }
    }

    if (symbol === SequelizeOp.and) {
      let queries = arrayisze_object(matchobject[SequelizeOp.and]);
      if (queries.length === 0) {
        return true;
      } else {
        return queries.every((query) => {
          return special_matchers(item, query);
        });
      }
    }

    if (symbol === SequelizeOp.contains) {
      let array = matchobject[SequelizeOp.contains];

      // prettier-ignore
      precondition(Array.isArray(array), `Op.contains without array inside.. not sure what to do`);
      // prettier-ignore
      precondition(array.length === 1, `Op.contains needs an array with one element, for now`);

      // TODO make sure that item *has* to be an array, and can't be null
      // prettier-ignore
      precondition(Array.isArray(item), `Op.contains can not be applied to a non-array`);

      let match_frame = array[0];
      return item.some((x) => isMatch(x, match_frame));
    }
    if (symbol === SequelizeOp.eq) {
      return item === matchobject[SequelizeOp.eq];
    }
    if (symbol === SequelizeOp.ne) {
      return item !== matchobject[SequelizeOp.ne];
    }
    if (symbol === SequelizeOp.gte) {
      return item >= matchobject[SequelizeOp.gte];
    }
    if (symbol === SequelizeOp.gt) {
      return item > matchobject[SequelizeOp.gt];
    }
    if (symbol === SequelizeOp.lte) {
      return item <= matchobject[SequelizeOp.lte];
    }
    if (symbol === SequelizeOp.lt) {
      return item < matchobject[SequelizeOp.lt];
    }
    if (symbol === SequelizeOp.in) {
      return matchobject[SequelizeOp.in].includes(item);
    }
    if (symbol === SequelizeOp.notIn) {
      return !matchobject[SequelizeOp.notIn].includes(item);
    }
    if (symbol === SequelizeOp.between) {
      let [lowerbound, upperbound] = matchobject[SequelizeOp.between];
      return lowerbound < item && item < upperbound;
    }
    if (symbol === SequelizeOp.iLike) {
      if (item == null) {
        return false;
      }

      let ilike_pattern = matchobject[SequelizeOp.iLike].toLowerCase();
      return generate_like_regex(ilike_pattern).test(item.toLowerCase());
    }
    if (symbol === SequelizeOp.like) {
      if (item == null) {
        return false;
      }

      let like_pattern = matchobject[SequelizeOp.like];
      return generate_like_regex(like_pattern).test(item);
    }

    throw new Error(`Implement symbol '${String(symbol)}'`);
  });
};

let does_match_where = (item, where, fields) => {
  // No query, so everything passes!!!
  if (where === undefined) {
    return true;
  }

  // prettier-ignore
  precondition(where !== null, `Explicitly passed in 'null' to 'where: ...', you sure?`);
  // prettier-ignore
  precondition(typeof where === 'object', `where object is... not an object: '${where}'`);

  if (where[SequelizeOp.and] != null) {
    let and_predicates = arrayisze_object(where[SequelizeOp.and]);
    let and_match = and_predicates.every((predicate) => {
      return does_match_where(item, predicate, fields);
    });

    if (and_match === false) {
      return false;
    }
  }

  if (where[SequelizeOp.or] != null) {
    let or_predicates = arrayisze_object(where[SequelizeOp.or]);

    let or_match = or_predicates.some((predicate) => {
      return does_match_where(item, predicate, fields);
    });

    if (or_match === false) {
      return false;
    } else {
      // Continue with the normal predicates
    }
  }

  let predicates = Object.entries(where);
  return predicates.every(([key, predicate]) => {
    // Make sure that every key in the where clause actually exists
    let field = fields[key];

    // prettier-ignore
    precondition(field != null, `Querying on key '${key}', but it is not defined in the model`);

    // TODO Have some casts throw with edgy values
    // let { cast = (x => x) } = field.type;
    // let value = cast(item[key]);
    let value = item[key];

    return special_matchers(value, predicate);
  });
};

exports.does_match_where = does_match_where;
exports.SequelizeOp = SequelizeOp;
