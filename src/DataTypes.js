let precondition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

let Shallow = Symbol("Shallow type");

let Datatypes = {
  STRING: {
    [Shallow]: true,
    name: "STRING",
    cast: (x) => {
      return String(x);
    },
  },
  TEXT: {
    [Shallow]: true,
    name: "TEXT",
    cast: (x) => {
      return String(x);
    },
  },
  BOOLEAN: {
    [Shallow]: true,
    name: "BOOLEAN",
    cast: (x) => {
      return Boolean(x);
    },
  },
  JSON: {
    [Shallow]: true,
    name: "JSON",
    // cast?
  },
  JSONB: {
    [Shallow]: true,
    name: "JSONB",
    // cast?
  },
  UUID: {
    [Shallow]: true,
    name: "UUID",
    cast: (x) => {
      // COULD also do uuid conversion here but honestly... honestly?!
      return String(x);
    },
  },
  UUIDV4: {
    [Shallow]: true,
    name: "UUIDV4",
    create_default: ({ next_id }) => {
      // Generate a UUID like just for the feelz
      // (Honestly this is unecessary but idk feels good I guess?)
      // let id = padEnd(`${next_id_counter}`, 32, '0');
      // return `${id.slice(0,8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`;
      return `${next_id()}`;
    },
    cast: (x) => {
      return String(x);
    },
  },
  NOW: {
    [Shallow]: true,
    name: "NOW",
    create_default: () => {
      return Date.now();
    },
    cast: (x) => {
      // prettier-ignore
      throw new Error(`Sequelize.NOW is not usable as type`);
    },
  },
  INTEGER: {
    [Shallow]: true,
    name: "INTEGER",
    cast: (x) => {
      // prettier-ignore
      precondition(x !== '', `Tried to use an empty string as INTEGER`);

      let result = Number(x);

      // prettier-ignore
      precondition(Number.isInteger(result), `Tried to use '${x}' as INTEGER, but it aint (${result})`);

      return result;
    },
  },
  DECIMAL: {
    [Shallow]: true,
    name: "DECIMAL",
    cast: (x) => {
      // prettier-ignore
      precondition(x !== '', `Tried to use an empty string as DECIMAL`);

      let result = Number(x);

      // prettier-ignore
      precondition(Number.isFinite(result), `Tried to use '${x}' as DECIMAL, but it aint (${result})`);

      return result;
    },
  },
  DATE: {
    [Shallow]: true,
    name: "DATE",
    cast: (x) => {
      return new Date(x);
    },
  },
  ENUM: {
    [Shallow]: true,
    name: "ENUM",
    // cast?
  },
  BLOB: {
    [Shallow]: true,
    name: "BLOB",
  },
};

module.exports = { Datatypes, Shallow };
