// addon.cc — the module entry of occt_native.node. It exports a description of every class, constructor overload,
// method, static and enum (generated/register.cc), which index.js turns into an `oc` object shaped like
// opencascade.js, then hands back (setup) the JS prototypes and enum member objects the C++ side needs to make results.
#include "generated/surface.h"
#include <OSD.hxx>
#include <Standard_Version.hxx>
#include <BOPAlgo_Options.hxx>
#include <Message.hxx>
#include <Message_Messenger.hxx>
#include <Message_PrinterOStream.hxx>
#include <cstdlib>
#include <iostream>

namespace occt_native {

static Napi::Value Delete(const Napi::CallbackInfo& info) {
  Obj* o = Unwrap(info.This());
  if (!o) throw Napi::TypeError::New(info.Env(), "delete() called on something that is not an OpenCascade object");
  if (!o->alive) throw Napi::Error::New(info.Env(), std::string(g_types[o->type]->name) + " instance already deleted");
  TypeInfo* t = g_types[o->type];
  o->alive = false;
  if (t->transient) o->keep.Nullify();
  else if (t->destroy) t->destroy(o->ptr);
  o->ptr = nullptr;
  return info.Env().Undefined();
}
static Napi::Value IsDeleted(const Napi::CallbackInfo& info) {
  Obj* o = Unwrap(info.This());
  return Napi::Boolean::New(info.Env(), !o || !o->alive);
}

// setParallel(on): OpenCascade's own threads for Booleans (BOPAlgo's global parallel mode, read by every new
// BRepAlgoAPI operation) and BRepMesh (generated BRepMesh_IncrementalMesh_2 turns its isInParallel on)
static Napi::Value SetParallel(const Napi::CallbackInfo& info) {
  g_parallel = info.Length() > 0 && info[0].ToBoolean().Value();
  BOPAlgo_Options::SetParallelMode(g_parallel);
  return Napi::Boolean::New(info.Env(), g_parallel);
}

// setup(raws, enums): raws[id] is a constructor whose prototype is that class's; enums[name][member] the member object
static Napi::Value Setup(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Array raws = info[0].As<Napi::Array>();
  for (uint32_t i = 0; i < raws.Length() && i < g_types.size(); i++) {
    Napi::Value r = raws.Get(i);
    if (r.IsFunction()) g_types[i]->raw = Napi::Persistent(r.As<Napi::Function>());
  }
  Napi::Object enums = info[1].As<Napi::Object>();
  for (EnumInfo* e : g_enums) {
    Napi::Value o = enums.Get(e->name);
    if (!o.IsObject()) continue;
    for (auto& m : e->members) {
      Napi::Value v = o.As<Napi::Object>().Get(m.first);
      if (v.IsObject() && e->values.find(m.second) == e->values.end()) e->values[m.second] = Napi::Persistent(v.As<Napi::Object>());
    }
  }
  return env.Undefined();
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  // access violations and other structured exceptions inside OpenCascade become OSD_Exception_* (Standard_Failure),
  // which the bindings turn into JS Errors, instead of ending the process (needs /EHa, as OpenCascade is built)
  OSD::SetThreadLocalSignal(OSD_SignalMode_Set, Standard_False);
  // OpenCascade's messages (the STEP writer's transfer statistics) went to the browser console in the wasm engine and
  // are silent in headless/occt.js unless ANVIL_OCCT_LOG is set: here likewise, and then on stderr, never on stdout
  const opencascade::handle<Message_Messenger>& msg = Message::DefaultMessenger();
  msg->RemovePrinters(STANDARD_TYPE(Message_PrinterOStream));
  if (std::getenv("ANVIL_OCCT_LOG")) msg->AddPrinter(new Message_PrinterOStream("cerr", Standard_False, Message_Trace));
  RegisterTypes();
  for (size_t i = 0; i < g_types.size(); i++) g_typeByName[g_types[i]->name] = (int)i;
  Napi::Object out = Napi::Object::New(env);
  out.Set("classes", Napi::Object::New(env));
  RegisterBindings(env, out);
  Napi::Object enums = Napi::Object::New(env);
  for (EnumInfo* e : g_enums) {
    Napi::Array a = Napi::Array::New(env, e->members.size());
    for (size_t i = 0; i < e->members.size(); i++) {
      Napi::Array p = Napi::Array::New(env, 2);
      p.Set((uint32_t)0, Napi::String::New(env, e->members[i].first));
      p.Set((uint32_t)1, Napi::Number::New(env, e->members[i].second));
      a.Set((uint32_t)i, p);
    }
    enums.Set(e->name, a);
  }
  exports.Set("classes", out.Get("classes"));
  exports.Set("enums", enums);
  exports.Set("typeCount", Napi::Number::New(env, (double)g_types.size()));
  exports.Set("setup", Napi::Function::New(env, Setup, "setup"));
  exports.Set("delete", Napi::Function::New(env, Delete, "delete"));
  exports.Set("isDeleted", Napi::Function::New(env, IsDeleted, "isDeleted"));
  exports.Set("setParallel", Napi::Function::New(env, SetParallel, "setParallel"));
  exports.Set("occtVersion", Napi::String::New(env, OCC_VERSION_COMPLETE));
  return exports;
}

}  // namespace occt_native

static Napi::Object InitModule(Napi::Env env, Napi::Object exports) { return occt_native::Init(env, exports); }
NODE_API_MODULE(occt_native, InitModule)
