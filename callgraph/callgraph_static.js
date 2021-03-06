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
* Ehren Metcalfe, ehren.m@gmail.com
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

require({ after_gcc_pass: "cfg" });
include('gcc_util.js');
include('gcc_print.js');
include('unstable/lazy_types.js');
include('unstable/dehydra_types.js');

const DEBUG = false;

let edges = [];
let escaping_nodes = [];
let virtuals = [];
let weights = [];

function input_end() {
  write_file(sys.aux_base_name + "." + filenum + ".cg.sql", output_cache);
}

let filenum = 0;
let output_cache = "";
let hitcount = 0;
const cache_max = 2048;

function write_callgraph_file(str) {
  output_cache += str + "\n";
  if (hitcount < cache_max)
    ++hitcount;
  else {
    write_file(sys.aux_base_name + "." + filenum + ".cg.sql", output_cache);
    ++filenum;
    output_cache = "";
    hitcount = 0;
    visited = [];
  }
}

function write_node(node) {
  write_callgraph_file(serialize_node(node));
}

function write_edge(edge) {
  write_callgraph_file(serialize_edge(edge));
}

function write_escaping_node(node) {
  write_callgraph_file(serialize_escaping_node(node));
}

function write_virtual(virtual) {
  write_callgraph_file(serialize_virtual(virtual));
}

function serialize_edge(edge) {
  let serial = serialize_node(edge.caller);
  serial += serialize_node(edge.callee);
  serial += edge_string(edge);
  serial += '\n';
  return serial;
}

function serialize_escaping_node(node) {
  let serial = serialize_node(node);
  serial    += 'UPDATE node SET addressHeld = 1 WHERE id = ' +
               id_from_name_loc_subquery(node) + ';\n\n';
  return serial;
}

function serialize_virtual(tuple) {
  let serial = "";
  serial += serialize_node(tuple.implementor);
  serial += serialize_node(tuple.interface);
  serial += 'INSERT INTO implementors (implementor, implementorID, interface, interfaceID, method, loc) VALUES ("' +
            serialize_class(tuple.implementor) + '", ' +
            id_from_name_loc_subquery(tuple.implementor) + ', "' +
            serialize_class(tuple.interface) + '", ' +
            id_from_name_loc_subquery(tuple.interface) + ', "' +
            serialize_method(tuple.implementor) + '", "' +
            tuple.interface.loc +
          '");\n\n';
  return serial;
}

function serialize_full_method(method) {
  return method.rt + " " + serialize_class(method) + "::" + serialize_method(method);
}

function serialize_method(method) {
  return method.method + "(" + method.params.join(", ") + ")";
}

function serialize_class(method) {
  return (method.ns ? (method.ns + "::") : "") +
         (method.class ? method.class : "");
}

function serialize_boolean(bool) {
  return bool ? "1" : "0";
}

function serialize_integer(n) {
  return n ? n : 0;
}

function ensure_string(str) {
  return (str || '');
}

function serialize_node(node) {
  return 'INSERT INTO node (name, returnType, namespace, type, shortName, assemblerName, isPtr, isStatic, isMethod, isVirtual, isScriptable, visibility, visibilitySpecified, weight, loc) VALUES ("' +
           serialize_full_method(node) + '", "' +
           ensure_string(node.rt) + '", "' +
           ensure_string(node.ns) + '", "' +
           ensure_string(node.class) + '", "' +
           ensure_string(node.method) + '", "' +
           node.assemblerName + '", ' +
           serialize_boolean(node.isPtr) + ', ' +
           serialize_boolean(node.isStatic) + ', ' +
           serialize_boolean(node.isMethod) + ', ' +
           serialize_boolean(node.isVirtual) + ', ' +
           serialize_boolean(node.isScriptable) + ', ' +
           serialize_integer(node.visibility) + ', ' +
           serialize_integer(node.visibilitySpecified) + ', ' +
           serialize_integer(weights[serialize_full_method(node)]) + ', "' +
           node.loc +
         '");\n';
}

function id_from_name_loc_subquery(node) {
 return '(SELECT id FROM node WHERE name = "' + serialize_full_method(node) +
        '" AND loc = "' + node.loc + '")';
}

function edge_string(edge) {
  return 'INSERT INTO edge (caller, callee) VALUES (' +
          id_from_name_loc_subquery(edge.caller) + ', ' +
          id_from_name_loc_subquery(edge.callee) +
         ');\n';
}

function process_tree_type(t) {
  // scan the class, and its bases, for virtual functions
  if (!COMPLETE_TYPE_P(t))
    return;

  // check if we have a class or struct
  let kind = class_key_or_enum_as_string(t);
  if (kind != "class" && kind != "struct")
    return;

  // for each member method...
  for (let func = TYPE_METHODS(t); func; func = TREE_CHAIN(func)) {
    if (TREE_CODE(func) != FUNCTION_DECL)
      continue;

    if (DECL_ARTIFICIAL(func)) continue;
    if (DECL_CLONED_FUNCTION_P(func)) continue;
    if (TREE_CODE(func) == TEMPLATE_DECL) continue;

    if (DECL_PURE_VIRTUAL_P(func) || !DECL_VIRTUAL_P(func))
      continue;

    // ignore destructors here?

    // have a class method. pull the namespace and class names.
    let implementor = get_names(func);
    debug_print("impl: " + serialize_full_method(implementor));

    // have a nonpure virtual member function...
    // which could potentially be implemented by this class.
    // scan subclasses to find which ones declare it.
    process_subclasses(t, implementor);
  }
}

function get_names(decl) {
  // for a class, names.class and names.method will be defined.
  // for a function, names.method will be defined.
  // for either, names.ns may be defined depending on whether the context is a namespace.
  // for a fnptr, there will be no namespace, class name, or method name -
  // just a return type and params.
  let names = {};

  let fn = TREE_CODE(TREE_TYPE(decl)) == FUNCTION_TYPE ||
           TREE_CODE(TREE_TYPE(decl)) == METHOD_TYPE;
  if (!fn)
    throw new Error("decl is not a function!");

  // check if we have a function pointer.
  let fnptr = TREE_CODE(decl) == POINTER_TYPE;
  if (fnptr)
    names.isPtr = true;

  // return type name
  names.rt = type_string(TREE_TYPE(TREE_TYPE(decl)));

  // XXX ptr to member?
  // see http://tuvix.apple.com/documentation/DeveloperTools/gcc-4.2.1/gccint/Expression-trees.html PTRMEM_CST

  // namespace and class name. but if this is a fnptr, there is no context to be had...
  if (!fnptr) {
    names.assemblerName = IDENTIFIER_POINTER(DECL_ASSEMBLER_NAME(decl));
    names.isScriptable = has_scriptable_attribute(DECL_ATTRIBUTES(decl));

    // in Mozilla, visibility is always VISIBILITY_DEFAULT or VISIBILITY_HIDDEN
    names.visibility = DECL_VISIBILITY(decl);
    names.visibilitySpecified = DECL_VISIBILITY_SPECIFIED(decl);

    // we have a function or method.
    let context = DECL_CONTEXT(decl);
    if (context) {
      // resolve the file loc to a unique absolute path, with no symlinks.
      // use the context here since the declaration will be unique.
      names.loc = location_string(context);

      let have_class = TYPE_P(context);
      if (have_class) {
        if (has_scriptable_attribute(TYPE_ATTRIBUTES(context)))
          names.isScriptable = true;
        context = TYPE_NAME(context);
      }

      let array = context.toCString().split("::");
      if (array.length == 0)
        throw new Error("no context!");

      if (have_class) {
        // have a class or struct. last element in the array is the class name,
        // and everything before are the namespaces.
        names.class = array.pop();
        if (names.class.length == 0)
          throw new Error("no class name!");
      }
      if (array.length > 0) {
        // the rest are namespaces.
        names.ns = array.join("::");
      }
      
      names.isMethod = true;

      // mark method as static
      if (TREE_CODE(TREE_TYPE(decl)) == FUNCTION_TYPE) {
        names.isStatic = true;
      }
    } else {
      // resolve the file loc to a unique absolute path, with no symlinks.
      // have no context, so use what we've got
      names.loc = location_string(decl);

      // mark function as static
      if (!TREE_PUBLIC(decl)) {
        names.isStatic = true;
      }
    }

    // XXX for has_this: DECL_NONSTATIC_MEMBER_FUNCTION_P
    // XXX for class ctx (incl enum/union/struct) see gcc_compat.js:class_key_or_enum_as_string(t)

    // method name
    let name = DECL_NAME(decl);
    if (name) {
      // if we have a cloned constructor/destructor (e.g. __comp_ctor/
      // __comp_dtor), pull the original name
      if (DECL_LANG_SPECIFIC(decl) && DECL_CONSTRUCTOR_P(decl)) {
        names.method = names.class;
      } else if (DECL_LANG_SPECIFIC(decl) && DECL_DESTRUCTOR_P(decl)) {
        names.method = "~" + names.class;
      } else if (DECL_LANG_SPECIFIC(decl) && IDENTIFIER_OPNAME_P(name) && IDENTIFIER_TYPENAME_P(name)) {
        // type-conversion operator, e.g. |operator T*|. gcc assigns a random name
        // along the lines of |operator 11|, so come up with something more useful.
        names.method = "operator " + type_string(TREE_TYPE(name));
      } else {
        // usual case.
        names.method = IDENTIFIER_POINTER(name);
      }

      if (DECL_VIRTUAL_P(decl))
        names.isVirtual = true;

      //names.push(DECL_UID(decl)); // UID of method
    }

    if (!names.loc)
      throw new Error("should have a loc by now!");

  } else {
    // provide something sensible for fnptrs.
    names.method = "(*)";
    names.loc = "";
  }

  // parameter type names
  let type = TREE_TYPE(decl);
  let args = TYPE_ARG_TYPES(type);
  if (TREE_CODE(type) == METHOD_TYPE) {
    // skip |this|
    args = TREE_CHAIN(args);
  }

  names.params = [ type_string(TREE_VALUE(pt))
                   for (pt in flatten_chain(args)) 
                     if (TREE_CODE(TREE_VALUE(pt)) != VOID_TYPE) ];

  return names;
}

function has_scriptable_attribute(attrs) {
  for each (let attr in rectify_attributes(attrs))
    if (attr.name == 'user')
      for each (let arg in attr.args)
        if (arg == 'NS_script')
          return true;
  return false;
}

function location_string(decl) {
  let loc = location_of(decl);
  if (loc == UNKNOWN_LOCATION)
    throw new Error("unknown location");

  if (LOC_IS_BUILTIN(loc))
    return "<built-in>";

  let path = loc.file;
  try {
    return resolve_path(path);
  } catch(e) {
    if (e.message.indexOf("No such file or directory")) {
      // this can occur if people use the #line directive to artificially override
      // the source file name in gcc. in such cases, there's nothing we can really
      // do, and it's their fault if the filename clashes with something.
      return path;
    }

    // something else happened - rethrow
    throw new Error(e);
  }
}

let visited = [];

function process_subclasses(c, implementor) {
  // ignore TYPENAME_TYPE, etc
  if (TREE_CODE(c) != RECORD_TYPE || !TYPE_BINFO(c))
    return;

  // avoiding duplicate processing provides a modest speed increase
  let key = TYPE_NAME(c) + implementor.assemblerName;
  if (visited[key])
    return;
  visited[key] = true;

  let bases = [ BINFO_TYPE(base_binfo)
                for each (base_binfo in 
                          VEC_iterate(BINFO_BASE_BINFOS(TYPE_BINFO(c)))) ];

  for each (base in bases) {
    // for each member method...
    for (let func = TYPE_METHODS(base); func; func = TREE_CHAIN(func)) {
      if (TREE_CODE(func) != FUNCTION_DECL)
        continue;

      if (DECL_ARTIFICIAL(func)) continue;
      if (DECL_CLONED_FUNCTION_P(func)) continue;
      if (TREE_CODE(func) == TEMPLATE_DECL) continue;

      if (!DECL_VIRTUAL_P(func))
        continue;

      // have a class method. pull the namespace and class names.
      let iface = get_names(func);
      debug_print("iface: " + serialize_full_method(iface));

      if (method_signatures_match(implementor, iface)) {
        let v = { "implementor": implementor, "interface": iface };
        write_virtual(v);
      }
    }

    // scan subclass bases as well
    process_subclasses(base, implementor);
  }
}

function method_signatures_match(m1, m2) {
  return m1.method == m2.method &&
         m1.params.join(",") == m2.params.join(",") &&
         m1.rt == m2.rt;
}

function process_tree(fn) {
  let caller = get_names(fn);
  let edge_pushed = false;
  let weight = 0;

  debug_print("CALLER:      " + serialize_full_method(caller));

  // in rare cases, we won't see every function unless
  // submethods are processed via the function body
  let context = DECL_CONTEXT(fn);
  if (context && TYPE_P(context))
    process_subclasses(context, caller);

  // const/static initializations are hoisted out of the function body.
  for (let decl in local_decls_iterator(fn)) {
    let init = DECL_INITIAL(decl);
    if (!init)
      continue;
    walk_tree(init, function (t) {
      for (let addr in resolve_virtual_fn_addr_exprs(t))
        write_edge({ "caller": caller, "callee": get_names(addr) });
      if (TREE_CODE(t) == FUNCTION_DECL)
        write_edge({ "caller": caller, "callee": get_names(t) });
    });
  }

  let cfg = function_decl_cfg(fn);
  for (let isn in cfg_isn_iterator(cfg)) {
    ++weight;

    // look for address taking in an assignment
    if (gimple_code(isn) == GIMPLE_ASSIGN) {
      let rhs = gimple_op(isn, 1);
      if (TREE_CODE(rhs) != ADDR_EXPR)
        continue;
      rhs = TREE_OPERAND(rhs, 0);
      if (TREE_CODE(rhs) == FUNCTION_DECL)
        write_edge({ "caller": caller, "callee": get_names(rhs) });
    }

    for (let addr in resolve_virtual_fn_addr_exprs(isn))
      write_edge({ "caller": caller, "callee": get_names(addr) });

    if (gimple_code(isn) != GIMPLE_CALL)
      continue;
    let callee = resolve_function_decl(isn);
    if (!callee)
      throw new Error("unresolvable function " + gs_display(isn));

    // serialize the call
    write_edge({ caller: caller, callee: get_names(callee) });

    // look for function addresses in the args of the call
    for (let arg in gimple_call_arg_iterator(isn)) {
      if (TREE_CODE(arg) != ADDR_EXPR)
        continue;
      arg = TREE_OPERAND(arg, 0);
      if (TREE_CODE(arg) == FUNCTION_DECL)
        write_edge({ "caller": caller, "callee": get_names(arg) });
    }
    edge_pushed = true;
  }
  weights[serialize_full_method(caller)] = weight;

  // ensure registration of uncalled functions that make no calls
  if (!edge_pushed) {
    write_node(caller);
  }
}

function resolve_function_decl(gimple_call) {
  let decl = gimple_call_fndecl(gimple_call);
  if (decl)
    return decl;

  let op = gimple_op(gimple_call, 1);
  switch (TREE_CODE(op)) {
    case OBJ_TYPE_REF:
      return resolve_virtual_fun_from_obj_type_ref(op);
    case VAR_DECL:
    case PARM_DECL:
    case INTEGER_CST: // eg ((void(*)())0)();
      // Have a function pointer. The decl, if it exists, holds the fnptr, but we're interested in the type.
      return TREE_TYPE(op);
    default:
      throw new Error("resolve_function_decl: unresolvable decl with TREE_CODE " + TREE_CODE(op));
  }
}

// look for functions held in globals
function process_tree_decl(decl) {
  let init = DECL_INITIAL(decl)
  if (!init)
    return;
  walk_tree(init, function (t) {
    if (TREE_CODE(t) == FUNCTION_DECL)
      write_escaping_node(get_names(t));
    for (let addr in resolve_virtual_fn_addr_exprs(t))
      write_escaping_node(get_names(addr));
  });
}

function debug_print(str) {
  if (DEBUG)
    print(str);
}

