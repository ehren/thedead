#!/usr/bin/python

import sys
import sqlite3

def setup(cursor):
    try:
        cursor.execute("ALTER TABLE node ADD COLUMN isAlive INTEGER")
    except:
        pass
    try:
        cursor.execute("CREATE INDEX idx_node_assemblerName ON node (assemblerName)")
    except:
        pass

    cursor.execute("UPDATE node SET isAlive = 0")
    cursor.execute("DROP TABLE IF EXISTS pseudo_edge")
    cursor.execute("""CREATE TABLE pseudo_edge (
                      caller INTEGER REFERENCES node,
                      callee INTEGER REFERENCES node,
                      PRIMARY KEY(caller, callee) ON CONFLICT IGNORE)""")
    cursor.execute("""INSERT INTO pseudo_edge
                      SELECT * FROM edge""")
    cursor.execute("""INSERT INTO pseudo_edge (caller, callee)
                      SELECT interfaceID, implementorID
                      FROM implementors
                      UNION
                      SELECT implementorID, interfaceID
                      FROM implementors""")
    cursor.execute("""INSERT INTO pseudo_edge (caller, callee)
                      SELECT n.id, nn.id
                      FROM node n, node nn
                      WHERE n.id != nn.id
                      AND n.assemblerName = nn.assemblerName""")

def calcalive(cursor):
    setup(cursor)
    cursor.execute("""SELECT id FROM node
                      WHERE isScriptable = 1 OR
                      addressHeld = 1 OR
                      name = 'int ::main(int, char**)' OR
                      name = 'int ::main()' OR
                      name = 'void ::__static_initialization_and_destruction_0(int, int)' OR
                      name LIKE '%~%' OR
                      name LIKE 'void ::_GLOBAL__I_%'""")
#                      visibility != 0 OR

    worklist = set()
    for id in cursor:
        worklist.add(id[0])

    while len(worklist):
        node = worklist.pop()
        cursor.execute("UPDATE node SET isAlive = 1 WHERE id = %d" %(node))
        cursor.execute("""SELECT callee
                          FROM pseudo_edge
                          JOIN node ON (callee = id)
                          WHERE caller = %d
                          AND isAlive = 0""" %(node))
        for id in cursor:
            id = id[0]
            print "alive: %d" %(id)
            worklist.add(id)

def main():
    connection = sqlite3.connect(sys.argv[1])
    cursor = connection.cursor()
    cursor.execute("BEGIN TRANSACTION")

    calcalive(cursor)

    cursor.close()
    connection.commit()
    connection.close()

if __name__ == "__main__":
    main()
