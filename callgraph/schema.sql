CREATE TABLE node(
  id INTEGER PRIMARY KEY,
  name TEXT,
  assemblerName TEXT,
  isPtr INTEGER,
  isStatic INTEGER,
  isMethod INTEGER,
  isVirtual INTEGER,
  isScriptable INTEGER,
  visibility INTEGER,
  visibilitySpecified INTEGER,
  addressHeld INTEGER DEFAULT 0,
  weight INTEGER,
  loc TEXT,
  UNIQUE (name, loc) ON CONFLICT IGNORE
);

CREATE TABLE edge(
  caller INTEGER REFERENCES node,
  callee INTEGER REFERENCES node,
  PRIMARY KEY(caller, callee) ON CONFLICT IGNORE
);
-- XXX don't ignore duplicate edges? postprocess to add a count to the edge?

CREATE TABLE implementors(
  implementor TEXT,
  implementorID,
  interface TEXT,
  interfaceID,
  method TEXT,
  loc TEXT,
  UNIQUE (implementor, interface, method, loc) ON CONFLICT IGNORE
);

