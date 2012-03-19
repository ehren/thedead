/* ***** BEGIN LICENSE BLOCK *****
* Version: MPL 1.1/GPL 2.0/LGPL 2.1
*
* The contents of this file are subject to the Mozilla Public License Version
* 1.1 (the "License"); you may not use this file except in compliance with
* the License. You may obtain a copy of the License at
* http://www.mozilla.org/MPL/
*
* Software distributed under the License is distributed on an "AS IS" basis,
* WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
* for the specific language governing rights and limitations under the
* License.
*
* The Original Code is mozilla.org code.
*
* The Initial Developer of the Original Code is
* The Mozilla Foundation.
* Portions created by the Initial Developer are Copyright (C) 2012
* the Initial Developer. All Rights Reserved.
*
* Contributor(s):
* Daniel Witte, Mozilla Corporation
*
* Alternatively, the contents of this file may be used under the terms of
* either the GNU General Public License Version 2 or later (the "GPL"), or
* the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
* in which case the provisions of the GPL or the LGPL are applicable instead
* of those above. If you wish to allow use of your version of this file only
* under the terms of either the GPL or the LGPL, and not to allow others to
* use your version of this file under the terms of the MPL, indicate your
* decision by deleting the provisions above and replace them with the notice
* and other provisions required by the GPL or the LGPL. If you do not delete
* the provisions above, a recipient may use your version of this file under
* the terms of any one of the MPL, the GPL or the LGPL.
*
* ***** END LICENSE BLOCK ***** */

let Ci = Components.interfaces;
let Cc = Components.classes;

parseDB(arguments[0], arguments[1], arguments[2]);

function parseDB(inFile, outFile, prefix) {
  let edges = [];

  let ss = Cc["@mozilla.org/storage/service;1"].getService(Ci.mozIStorageService);
  let db = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
  db.initWithPath(inFile);

  let conn = ss.openDatabase(db);
  let edge = conn.createStatement("SELECT * FROM edge");
  while (edge.executeStep()) {
    let caller = edge.row.caller;
    let callee = edge.row.callee;

    let nodeCaller = conn.createStatement("SELECT name, loc FROM node WHERE id = :id");
    nodeCaller.params.id = caller;
    nodeCaller.executeStep();

    let nodeCallee = conn.createStatement("SELECT name, loc FROM node WHERE id = :id");
    nodeCallee.params.id = callee;
    nodeCallee.executeStep();

    let edgeStr = '"' + nodeCaller.row.name + '\\n(' + strip(nodeCaller.row.loc, prefix) + ')" -> "' +
                        nodeCallee.row.name + '\\n(' + strip(nodeCallee.row.loc, prefix) + ')";';
    edges.push(edgeStr);
  }

  let dot = "digraph callgraph {\n";
  for each (edge in edges) {
    dot += "  " + edge + "\n";
  }
  dot += "}\n";

  let dotFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
  dotFile.initWithPath(outFile);
  var stream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
  stream.init(dotFile, -1, -1, 0);
  stream.write(dot, dot.length);
  stream.close();
}

function strip(path, prefix) {
  if (path.substr(0, prefix.length) == prefix)
    return path.substr(prefix.length, path.length - prefix.length);
  return path;
}
