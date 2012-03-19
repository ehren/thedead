#!/usr/bin/python

import sys
import sqlite3

def groupdead(cursor):
    cursor.execute("SELECT count(*) FROM node WHERE isAlive = 0")
    count = cursor.fetchone()[0]
    i = 0
    components = []
    cursor.execute("SELECT id FROM node WHERE isAlive = 0")
    for id in cursor.fetchall():
        id = id[0]
        print "id: %d, %d / %d" %(id, i, count)
        i = i + 1

        sets_with_node = [] 
        node_set = set([id])
        for s in components:
            if id in s:
                node_set.update(s)
                components.remove(s)
                print 'merge!'
                print node_set

        cursor.execute("""SELECT caller
                          FROM pseudo_edge
                          WHERE callee = %d
                          UNION 
                          SELECT callee
                          FROM pseudo_edge
                          JOIN node on (id = callee)
                          WHERE caller = %d
                          AND isAlive = 0
                          """ %(id, id))

        for connected_node in cursor:
            connected_node = connected_node[0]

            found = False;
            for s in components:
                if connected_node in s:
                    node_set.update(s)
                    components.remove(s)
                    print 'merge set with set of other node!'
                    print node_set
            if not found:
                print 'adding other node: %d' %(connected_node,)
                node_set.add(connected_node)

        components.append(node_set)

    cursor.execute("DROP TABLE IF EXISTS unused")
    cursor.execute("CREATE TABLE unused ( id INTEGER REFERENCES node, componentID INTEGER, size INTEGER, PRIMARY KEY (id, componentID) ON CONFLICT IGNORE )")

    component_id = 0
    for s in components:
        # track the size of the whole component to simplify further queries
        size = len(s)
        for n in s:
            cursor.execute("INSERT into unused (id, componentID, size) VALUES (%d, %d, %d)" %(n, component_id, size))
        component_id = component_id + 1

def groupsingletons(cursor):
    try:
        cursor.execute("ALTER TABLE unused ADD COLUMN hasSingletons INTEGER")
    except:
        pass

    cursor.execute("UPDATE unused SET hasSingletons = 0")

    cursor.execute("""SELECT componentID, loc
                      FROM unused u
                      JOIN node n
                      ON (u.id = n.id)
                      WHERE size = 1""")

    for row in cursor.fetchall():
        componentID = row[0]
        loc = row[1]

        print("merging singleton " + str(componentID))
        
        cursor.execute("""SELECT componentID
                          FROM unused u
                          JOIN node n
                          ON (u.id = n.id)
                          WHERE size = 1 AND
                          componentID != %d AND
                          loc = '%s'""" %(componentID, loc))

        results = cursor.fetchall();
        for other in results:
            other = other[0]
            size = len(results) + 1
            cursor.execute("""UPDATE unused
                              SET componentID = %d,
                              hasSingletons = 1,
                              size = %d
                              WHERE componentID = %d""" %(componentID, size, other))

            cursor.execute("""UPDATE unused
                              SET hasSingletons = 1,
                              size = %d
                              WHERE componentID = %d""" %(size, componentID,))

def main():
    connection = sqlite3.connect(sys.argv[1])
    cursor = connection.cursor()
    cursor.execute("BEGIN TRANSACTION")

    groupdead(cursor)
    groupsingletons(cursor)

    cursor.close()
    connection.commit()
    connection.close()

if __name__ == "__main__":
    main()
