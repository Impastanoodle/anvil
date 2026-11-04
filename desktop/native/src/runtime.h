// runtime.h — the hand-written core of the native OpenCascade addon: how a JS object holds an OpenCascade object, how
// arguments and results cross between JS and C++ the way embind (opencascade.js) does it, and the helpers the
// generated bindings (src/generated, from gen.js) register their functions with.
//
// Every OpenCascade object in JS is a plain JS object wrapped (napi_wrap) around an Obj: its registered type, a
// pointer to the C++ object of exactly that type, and for Standard_Transient classes (Geom_*, Poly_Triangulation ...)
// a Handle that keeps it alive. delete() frees a plain object and lets go of a transient one (OpenCascade's reference
// count frees it when the last Handle goes, so a curve deleted from JS while a Handle_Geom_Curve still holds it stays
// valid — embind would free it under the Handle). Objects JS forgets without delete() are freed when collected.
// Results are always new JS objects owning a copy (embind copies results returned by value or by reference); a
// transient returned by pointer (Handle_X.get()) is wrapped as its most-derived registered class, as embind does.
#pragma once
#define NAPI_VERSION 8
#include <napi.h>
#include <Standard_Transient.hxx>
#include <Standard_Failure.hxx>
#include <Standard_Type.hxx>
#include <string>
#include <vector>
#include <unordered_map>
#include <type_traits>
#include <cstring>

namespace occt_native {

struct TypeInfo {
  const char* name;
  int id;
  int parent;                                   // the nearest registered base class, -1 for none
  bool transient;                               // derives from Standard_Transient
  bool isHandle;                                // a Handle_X (opencascade::handle<X>) wrapper
  void* (*upcast)(void* p, int target);         // p is this type; a pointer to the target base, or nullptr
  void (*destroy)(void* p);                     // delete (plain classes and handles)
  void* (*fromTransient)(Standard_Transient*);  // dynamic_cast to this type (transient classes)
  Standard_Transient* (*toTransient)(void*);    // this type to Standard_Transient* (transient classes)
  int handleOf;                                 // Handle_X: the id of X
  Napi::FunctionReference raw;                  // makes an empty JS object with this class's prototype
};
struct EnumInfo {
  const char* name;
  std::vector<std::pair<const char*, int> > members;
  std::unordered_map<int, Napi::ObjectReference> values;   // C++ value -> the JS member object (one per member)
};
extern std::vector<TypeInfo*> g_types;
extern std::vector<EnumInfo*> g_enums;
extern std::unordered_map<std::string, int> g_typeByName;
extern bool g_parallel;   // setParallel(true): OpenCascade's own threads (Booleans, BRepMesh)

struct Obj {
  int type;
  void* ptr;
  opencascade::handle<Standard_Transient> keep;
  bool alive;
};

template <class T> struct TypeOf;   // specialised in generated/surface.h: TypeOf<gp_Pnt>::id
template <class E> struct EnumOf;   // specialised in generated/surface.h

// ---- errors
[[noreturn]] void ThrowType(Napi::Env env, const std::string& msg);
std::string FailureMessage(const Standard_Failure& f);
#define OCC_TRY try {
#define OCC_CATCH                                                                                      \
  }                                                                                                    \
  catch (const Napi::Error&) { throw; }                                                                \
  catch (const Standard_Failure& f) { throw Napi::Error::New(info.Env(), FailureMessage(f)); }          \
  catch (const std::exception& e) { throw Napi::Error::New(info.Env(), std::string("OpenCascade: ") + e.what()); } \
  catch (...) { throw Napi::Error::New(info.Env(), "OpenCascade: unknown C++ exception"); }

// ---- objects
Obj* Unwrap(const Napi::Value& v);
void* CastTo(Napi::Env env, const Napi::Value& v, int target);
void Adopt(Napi::Env env, Napi::Object self, int type, void* p, Standard_Transient* t);
Napi::Value WrapOwned(Napi::Env env, int type, void* p);
Napi::Value WrapTransient(Napi::Env env, Standard_Transient* t, int staticType);
Napi::Value EnumValue(Napi::Env env, int e, int v);

template <class T> inline T& ArgObj(const Napi::Value& v, int target) {
  return *static_cast<T*>(CastTo(v.Env(), v, target));
}
// numbers as JS ToNumber / ToInt32 (embind passes undefined as NaN to a double and 0 to an int)
inline double ArgReal(const Napi::Value& v) {
  if (v.IsNumber()) return v.As<Napi::Number>().DoubleValue();
  return v.ToNumber().DoubleValue();
}
inline int ArgInt(const Napi::Value& v) {
  if (v.IsNumber()) return v.As<Napi::Number>().Int32Value();
  return v.ToNumber().Int32Value();
}
inline bool ArgBool(const Napi::Value& v) { return v.IsBoolean() ? v.As<Napi::Boolean>().Value() : v.ToBoolean().Value(); }
inline std::string ArgString(const Napi::Value& v) { return v.IsString() ? v.As<Napi::String>().Utf8Value() : v.ToString().Utf8Value(); }
int ArgEnum(const Napi::Value& v, int e);
void CheckCount(const Napi::CallbackInfo& info, int n, const char* fn);

// ---- results, by the C++ type the call returns
template <class R> Napi::Value Ret(Napi::Env env, R&& r) {
  using T = std::remove_cv_t<std::remove_reference_t<R> >;
  if constexpr (std::is_same_v<T, bool>) return Napi::Boolean::New(env, r);
  else if constexpr (std::is_enum_v<T>) return EnumValue(env, EnumOf<T>::id, (int)r);
  else if constexpr (std::is_arithmetic_v<T>) return Napi::Number::New(env, (double)r);
  else if constexpr (std::is_same_v<T, const char*> || std::is_same_v<T, char*>) return Napi::String::New(env, r ? r : "");
  else if constexpr (std::is_pointer_v<T>) {
    using P = std::remove_cv_t<std::remove_pointer_t<T> >;
    static_assert(std::is_base_of_v<Standard_Transient, P>, "a raw pointer result that is not a Standard_Transient");
    return WrapTransient(env, const_cast<P*>(r), TypeOf<P>::id);
  } else {
    static_assert(!std::is_base_of_v<Standard_Transient, T>, "a transient returned by value or reference");
    return WrapOwned(env, TypeOf<T>::id, new T(std::forward<R>(r)));
  }
}

// ---- registration (generated/register.cc calls these)
void Class(Napi::Env env, Napi::Object out, const char* name, int id, const char* parent);
void Ctor(Napi::Env env, Napi::Object out, const char* js, const char* cls, Napi::Function::Callback cb);
void Method(Napi::Env env, Napi::Object out, const char* cls, const char* js, Napi::Function::Callback cb);
void Static(Napi::Env env, Napi::Object out, const char* cls, const char* js, Napi::Function::Callback cb);
void HandleMethods(Napi::Env env, Napi::Object out, const char* h, Napi::Function::Callback ctor1, Napi::Function::Callback ctor2,
                   Napi::Function::Callback ctor3, Napi::Function::Callback isNull, Napi::Function::Callback get, Napi::Function::Callback nullify);

// Handle_X: constructors _1 () _2 (X*) _3 / _4 (Handle_X), IsNull(), get(), Nullify(), as opencascade.js has them
template <class X> struct HandleOps {
  typedef opencascade::handle<X> H;
  static int hid, xid;
  static Napi::Value ctor1(const Napi::CallbackInfo& info) {
    CheckCount(info, 0, "Handle constructor");
    Adopt(info.Env(), info.This().As<Napi::Object>(), hid, new H(), nullptr);
    return info.Env().Undefined();
  }
  static Napi::Value ctor2(const Napi::CallbackInfo& info) {
    CheckCount(info, 1, "Handle constructor");
    X* x = static_cast<X*>(CastTo(info.Env(), info[0], xid));
    Adopt(info.Env(), info.This().As<Napi::Object>(), hid, new H(x), nullptr);
    return info.Env().Undefined();
  }
  static Napi::Value ctor3(const Napi::CallbackInfo& info) {
    CheckCount(info, 1, "Handle constructor");
    H& o = ArgObj<H>(info[0], hid);
    Adopt(info.Env(), info.This().As<Napi::Object>(), hid, new H(o), nullptr);
    return info.Env().Undefined();
  }
  static Napi::Value isNull(const Napi::CallbackInfo& info) { return Napi::Boolean::New(info.Env(), ArgObj<H>(info.This(), hid).IsNull()); }
  static Napi::Value get(const Napi::CallbackInfo& info) {
    H& h = ArgObj<H>(info.This(), hid);
    if (h.IsNull()) return info.Env().Null();
    return WrapTransient(info.Env(), h.get(), xid);
  }
  static Napi::Value nullify(const Napi::CallbackInfo& info) { ArgObj<H>(info.This(), hid).Nullify(); return info.Env().Undefined(); }
};
template <class X> int HandleOps<X>::hid = -1;
template <class X> int HandleOps<X>::xid = -1;
template <class X> void HandleType(Napi::Env env, Napi::Object out, const char* name, int hid, int xid) {
  HandleOps<X>::hid = hid;
  HandleOps<X>::xid = xid;
  HandleMethods(env, out, name, HandleOps<X>::ctor1, HandleOps<X>::ctor2, HandleOps<X>::ctor3, HandleOps<X>::isNull, HandleOps<X>::get, HandleOps<X>::nullify);
}

}  // namespace occt_native
