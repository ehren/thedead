#!/usr/bin/python

import re
import sys
import json
import subprocess
import shutil
import sqlite3
from collections import deque

def strip(loc, prefix):
    if loc.find(prefix) is 0:
        return loc.replace(prefix, '', 1)
    return loc

def num_hidden(cursor, componentID):
    visible = {}

    hidden = 0

    cursor.execute("""SELECT n.id
                      FROM node n 
                      JOIN unused u
                      ON (n.id = u.id)
                      WHERE n.visibility = 0
                      AND u.componentID = """ + str(componentID))
    for id in cursor.fetchall():
        id = id[0]
        work = set()
        work.add(id)
        visited = set()
        while len(work):
            n = work.pop()

            if n in visible:
                if visible[n]:
                    visible[id] = True
                break

            cursor.execute("""SELECT visibility
                              FROM node
                              WHERE id = """ + str(n))
            if cursor.fetchone()[0] != 0:
                visible[n] = True
                visible[id] = True
                break

            cursor.execute("""SELECT caller
                              FROM pseudo_edge
                              WHERE callee = """ + str(n))

            for caller in cursor:
                caller = caller[0]
                if caller not in visited:
                    work.add(caller)
                    visited.add(caller)

        if (id in visible and not visible[id]) or (id not in visible):
            visible[id] = False
            hidden = hidden + 1

    print('hidden count for component id ' + str(componentID) + ': ' + str(hidden))
    return hidden

def generate_search(cursor, locprefix, directory):
#    cursor.execute("SELECT componentID, size, group_concat(replace(loc, '%s', ''), ', ') FROM unused u JOIN node n ON (u.id = n.id) GROUP BY componentID" % (locprefix,));

#    cursor.execute("SELECT componentID, size, group_concat(replace(loc, '%s', ''), ', ') 
#                    FROM 
#                    (
#                     SELECT distinct componentID, size, loc
#                     FROM
#                     unused u 
#                     JOIN node n ON (u.id = n.id)
#                    )
#                    GROUP BY componentID" % (locprefix,));

    print('generating search...')

    components = []
    cursor.execute("SELECT DISTINCT componentID, size, hasSingletons FROM unused");
    i = 0
    for row in cursor.fetchall():
        i = i + 1
        componentID = row[0]
        size = row[1]
        hasSingletons = row[2]

        locs = set()
        cursor.execute("""SELECT DISTINCT loc
                          FROM node n
                          JOIN unused u
                          ON (n.id = u.id)
                          WHERE componentID = %d""" %(componentID,))
        for loc in cursor:
            stripped = strip(str(loc[0]), locprefix)
            locs.add(stripped)

        component = (componentID, size, ', '.join(locs), num_hidden(cursor, componentID), hasSingletons)
        print(component)
        components.append(component)

    f = open(directory + "/dead.json", "w")
    f.write(json.dumps({ "aaData": components }))
    f.close()

def node_info(cursor, id):
    cursor.execute("""SELECT name, shortName, loc, visibility
                      FROM node n
                      JOIN unused u
                      ON (n.id = u.id)
                      WHERE n.id = """ + str(id))
    result = cursor.fetchone()
    return (result[0], result[1], result[2], result[3])

def color_for_visibility(visibility):
    if visibility:
        return "red"
    else:
        return "green"

def singleton_dot_string(cursor, component_id, locprefix, urlprefix, urlpostfix):
    nodes = set()
    cursor.execute("""SELECT id FROM unused WHERE componentID = %d""" %(component_id))
    for id in cursor.fetchall():
        id = id[0]
        name, short, loc, visibility = node_info(cursor, id)

        node_id = name + " " + strip(loc, locprefix)
        attrs = '"%s" [URL="%s%s%s", color=%s, LABEL="%s"]' %(node_id, urlprefix, short, urlpostfix, color_for_visibility(visibility), name);

        nodes.add(attrs)

    digraph = "digraph %d {\n" % (component_id,)
    digraph = digraph + "rankdir=LR\n;"
    digraph = digraph + "\n".join(nodes) + "\n}\n"
    return digraph

def dot_string(cursor, component_id, locprefix, urlprefix, urlpostfix):
    edges = set()
    cursor.execute("""SELECT caller, callee
                      FROM pseudo_edge
                      JOIN unused
                      ON (id = callee)
                      WHERE componentID = %d
                      UNION
                      SELECT caller, callee
                      FROM pseudo_edge
                      JOIN unused
                      ON (id = caller)
                      WHERE componentID = %d
                      AND callee IN 
                          (SELECT id
                           FROM node
                           WHERE isAlive = 0)""" %(component_id, component_id))
    for row in cursor.fetchall():
        caller = row[0]
        callee = row[1]

        caller_name, caller_short, caller_loc, caller_visibility = node_info(cursor, caller)
        callee_name, callee_short, callee_loc, callee_visibility = node_info(cursor, callee)

        caller_id = caller_name + " " + strip(caller_loc, locprefix)
        callee_id = callee_name + " " + strip(callee_loc, locprefix)
        caller_attrs = '"%s" [URL="%s%s%s", color=%s, LABEL="%s"]' %(caller_id, urlprefix, caller_short, urlpostfix, color_for_visibility(caller_visibility), caller_name);
        callee_attrs = '"%s" [URL="%s%s%s", color=%s, LABEL="%s"]' %(callee_id, urlprefix, callee_short, urlpostfix, color_for_visibility(callee_visibility), callee_name);

        edge_str = '"%s" -> "%s"; %s %s' %(caller_id, callee_id, caller_attrs, callee_attrs)
        edges.add(edge_str)

    digraph = "digraph %d {\n" % (component_id,)
    digraph = digraph + "\n".join(edges) + "\n}\n"
    return digraph

def generate_dot_files(cursor, directory, locprefix, urlprefix, urlpostfix):
    print('generating singleton dot files...')
    cursor.execute("SELECT distinct componentID FROM unused WHERE hasSingletons = 1 OR size = 1");
    for component_id in cursor.fetchall():
        component_id = component_id[0]
        print('singleton component id ' + str(component_id))

        p = subprocess.Popen(['dot', "-Tsvg", "-o", "%d.svg" %(component_id,)], stdin=subprocess.PIPE, cwd=directory)
        p.communicate(input=singleton_dot_string(cursor, component_id, locprefix, urlprefix, urlpostfix))

    print('generating dot files...')
    cursor.execute("SELECT distinct componentID FROM unused WHERE hasSingletons = 0 AND size > 1");
    for component_id in cursor.fetchall():
        component_id = component_id[0]
        print('component id ' + str(component_id))

        p = subprocess.Popen(['dot', "-Tsvg", "-o", "%d.svg" %(component_id,)], stdin=subprocess.PIPE, cwd=directory)
        p.communicate(input=dot_string(cursor, component_id, locprefix, urlprefix, urlpostfix))

def main():
    # FIXME better opt parsing
    connection = sqlite3.connect(sys.argv[1])
    locprefix = sys.argv[2]
    directory = sys.argv[3]

    if len(sys.argv) >= 5:
        urlprefix = sys.argv[4]
    else:
        urlprefix = ""

    if len(sys.argv) >= 6:
        urlpostfix = sys.argv[5]
    else:
        urlpostfix = ""

    cursor = connection.cursor()

    generate_search(cursor, locprefix, directory)
    generate_dot_files(cursor, directory, locprefix, urlprefix, urlpostfix)

    cursor.close()
    connection.close()

if __name__ == "__main__":
    main()
