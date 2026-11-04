// runtime.cc — see runtime.h.
#include "runtime.h"
#include <Message_ProgressRange.hxx>

namespace occt_native {

std::vector<TypeInfo*> g_types;
std::vector<EnumInfo*> g_enums;
std::unordered_map<std::string, int> g_typeByName;
bool g_parallel = false;

void ThrowType(Napi::Env env, const std::string& msg) { throw Napi::TypeError::New(env, msg); }

// OpenCascade's message, else the exception's class (StdFail_NotDone ...), as an Error's message
std::string FailureMessage(const Standard_Failure& f) {
  std::string type = f.DynamicType().IsNull() ? "Standard_Failure" : f.DynamicType()->Name();
  const char* m = f.GetMessageString();
  if (m && *m) return type + ": " + m;
  return type;
}

static void Finalize(napi_env, void* data, void*) {
  Obj* o = static_cast<Obj*>(data);
  if (o->alive) {
    TypeInfo* t = g_types[o->type];
    if (t->transient) o->keep.Nullify();
    else if (t->destroy) t->destroy(o->ptr);
  }
  delete o;
}

Obj* Unwrap(const Napi::Value& v) {
  if (!v.IsObject()) return nullptr;
  void* p = nullptr;
  if (napi_unwrap(v.Env(), v, &p) != napi_ok) return nullptr;
  return static_cast<Obj*>(p);
}

static std::string Repr(const Napi::Value& v) {
  if (v.IsUndefined()) return "undefined";
  if (v.IsNull()) return "null";
  if (v.IsObject()) return "[object]";
  return "\"" + v.ToString().Utf8Value() + "\"";
}

void* CastTo(Napi::Env env, const Napi::Value& v, int target) {
  Obj* o = Unwrap(v);
  const char* tn = g_types[target]->name;
  if (!o) ThrowType(env, std::string("Cannot pass ") + Repr(v) + " as a " + tn);
  if (!o->alive) ThrowType(env, std::string("Cannot pass deleted object as a pointer of type ") + tn);
  void* p = g_types[o->type]->upcast(o->ptr, target);
  if (!p) ThrowType(env, std::string("Expected null or instance of ") + tn + ", got an instance of " + g_types[o->type]->name);
  return p;
}

void Adopt(Napi::Env env, Napi::Object self, int type, void* p, Standard_Transient* t) {
  Obj* o = new Obj{ type, p, opencascade::handle<Standard_Transient>(t), true };
  napi_status s = napi_wrap(env, self, o, Finalize, nullptr, nullptr);
  if (s != napi_ok) { Finalize(env, o, nullptr); throw Napi::Error::New(env, "could not wrap an OpenCascade object"); }
}

Napi::Value WrapOwned(Napi::Env env, int type, void* p) {
  TypeInfo* t = g_types[type];
  if (t->raw.IsEmpty()) { t->destroy ? t->destroy(p) : (void)0; throw Napi::Error::New(env, std::string("class not set up: ") + t->name); }
  Napi::Object o = t->raw.New({});
  Adopt(env, o, type, p, nullptr);
  return o;
}

// a transient as its most-derived registered class (embind downcasts polymorphic pointers the same way)
Napi::Value WrapTransient(Napi::Env env, Standard_Transient* t, int staticType) {
  if (!t) return env.Null();
  int type = staticType;
  for (opencascade::handle<Standard_Type> d = t->DynamicType(); !d.IsNull(); d = d->Parent()) {
    auto it = g_typeByName.find(d->Name());
    if (it != g_typeByName.end() && g_types[it->second]->transient && g_types[it->second]->fromTransient) { type = it->second; break; }
  }
  TypeInfo* ti = g_types[type];
  void* p = ti->fromTransient ? ti->fromTransient(t) : nullptr;
  if (!p) { type = staticType; ti = g_types[type]; p = ti->fromTransient ? ti->fromTransient(t) : nullptr; }
  if (!p) throw Napi::Error::New(env, std::string("cannot wrap a ") + t->DynamicType()->Name());
  Napi::Object o = ti->raw.New({});
  Adopt(env, o, type, p, t);
  return o;
}

Napi::Value EnumValue(Napi::Env env, int e, int v) {
  EnumInfo* ei = g_enums[e];
  auto it = ei->values.find(v);
  if (it == ei->values.end()) return Napi::Number::New(env, v);
  return it->second.Value();
}
int ArgEnum(const Napi::Value& v, int e) {
  if (v.IsObject()) {
    Napi::Value x = v.As<Napi::Object>().Get("value");
    if (x.IsNumber()) return x.As<Napi::Number>().Int32Value();
  }
  if (v.IsNumber()) return v.As<Napi::Number>().Int32Value();
  ThrowType(v.Env(), std::string("Cannot pass ") + Repr(v) + " as a " + g_enums[e]->name);
}

void CheckCount(const Napi::CallbackInfo& info, int n, const char* fn) {
  if (n >= 0 && (int)info.Length() == n) return;
  ThrowType(info.Env(), std::string("function ") + fn + " called with " + std::to_string(info.Length()) + " arguments" +
                            (n >= 0 ? ", expected " + std::to_string(n) : ", no overload takes that many"));
}

// ---- registration: out.classes[name] = { id, parent, isHandle, ctors: {}, methods: {}, statics: {} }
static Napi::Object ClassDesc(Napi::Object out, const char* name) {
  Napi::Object classes = out.Get("classes").As<Napi::Object>();
  Napi::Value c = classes.Get(name);
  if (c.IsObject()) return c.As<Napi::Object>();
  Napi::Env env = out.Env();
  Napi::Object d = Napi::Object::New(env);
  d.Set("ctors", Napi::Object::New(env));
  d.Set("methods", Napi::Object::New(env));
  d.Set("statics", Napi::Object::New(env));
  classes.Set(name, d);
  return d;
}
void Class(Napi::Env env, Napi::Object out, const char* name, int id, const char* parent) {
  Napi::Object d = ClassDesc(out, name);
  d.Set("id", Napi::Number::New(env, id));
  if (parent) d.Set("parent", Napi::String::New(env, parent));
  g_typeByName[name] = id;
}
void Ctor(Napi::Env env, Napi::Object out, const char* js, const char* cls, Napi::Function::Callback cb) {
  ClassDesc(out, cls).Get("ctors").As<Napi::Object>().Set(js, Napi::Function::New(env, cb, js));
}
void Method(Napi::Env env, Napi::Object out, const char* cls, const char* js, Napi::Function::Callback cb) {
  ClassDesc(out, cls).Get("methods").As<Napi::Object>().Set(js, Napi::Function::New(env, cb, js));
}
void Static(Napi::Env env, Napi::Object out, const char* cls, const char* js, Napi::Function::Callback cb) {
  ClassDesc(out, cls).Get("statics").As<Napi::Object>().Set(js, Napi::Function::New(env, cb, js));
}
void HandleMethods(Napi::Env env, Napi::Object out, const char* h, Napi::Function::Callback ctor1, Napi::Function::Callback ctor2,
                   Napi::Function::Callback ctor3, Napi::Function::Callback isNull, Napi::Function::Callback get, Napi::Function::Callback nullify) {
  Napi::Object d = ClassDesc(out, h);
  int id = -1;
  for (size_t i = 0; i < g_types.size(); i++) if (g_types[i] && std::strcmp(g_types[i]->name, h) == 0) id = (int)i;
  d.Set("id", Napi::Number::New(env, id));
  d.Set("isHandle", Napi::Boolean::New(env, true));
  g_typeByName[h] = id;
  std::string n(h);
  Napi::Object c = d.Get("ctors").As<Napi::Object>();
  c.Set(n + "_1", Napi::Function::New(env, ctor1, n + "_1"));
  c.Set(n + "_2", Napi::Function::New(env, ctor2, n + "_2"));
  c.Set(n + "_3", Napi::Function::New(env, ctor3, n + "_3"));
  c.Set(n + "_4", Napi::Function::New(env, ctor3, n + "_4"));
  Napi::Object m = d.Get("methods").As<Napi::Object>();
  m.Set("IsNull", Napi::Function::New(env, isNull, "IsNull"));
  m.Set("get", Napi::Function::New(env, get, "get"));
  m.Set("Nullify", Napi::Function::New(env, nullify, "Nullify"));
}

}  // namespace occt_native
