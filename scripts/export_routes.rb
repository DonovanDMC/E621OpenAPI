# frozen_string_literal: true

class RouteExporter
  RouteInfo = Struct.new(
    :name,
    :path,
    :method,
    :controller,
    :action,
    :defaults,
    :constraints,
    keyword_init: true
  )

  def self.export
    Rails.application.routes.routes.filter_map do |route|
      reqs = route.requirements
      next unless reqs[:controller] && reqs[:action]

      verb = normalize_verb(route.verb)
      path = normalize_path(route.path.spec.to_s)

      RouteInfo.new(
        name: route.name,
        path: path,
        method: verb,
        controller: reqs[:controller],
        action: reqs[:action],
        defaults: route.defaults,
        constraints: extract_constraints(route)
      ).to_h
    end
  end

  def self.normalize_verb(verb)
    return nil if verb.nil?

    raw = verb.respond_to?(:source) ? verb.source.gsub(/[$^]/, "") : verb.to_s
    return "ANY" if raw.empty?

    raw
      .split("|")
      .map(&:strip)
      .reject(&:empty?)
      .join("|")
  end

  def self.normalize_path(path)
    path.sub(/\(\.:format\)$/, "")
  end

  def self.extract_constraints(route)
    route.constraints.each_with_object({}) do |(key, value), out|
      out[key] =
        case value
        when Regexp then value.source
        else value
        end
    end
  end
end
